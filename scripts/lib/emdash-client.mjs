/**
 * The authenticated JSON caller of the seed scripts (`pnpm seed`, `pnpm catalog:resync`).
 *
 * Two ways in, chosen by the environment:
 *  - `EMDASH_TOKEN` (`ec_pat_...`, a personal access token from the admin: Settings -> API Tokens) sends
 *    `Authorization: Bearer` on every call. No dev login, no setup shortcut: it works against a deployed site.
 *  - no token: the dev login of `astro dev` (cookie session, `GET /auth/dev-bypass`, and on a fresh database
 *    `GET /setup/dev-bypass?content=1` first). Only a dev server has these routes.
 *
 * The token is only ever put in the request header; no message of this module contains it.
 */

export const AUTH_MODE = { DEV: "dev", TOKEN: "token" };

export const TOKEN_PREFIX = "ec_pat_";
const DEFAULT_ORIGIN = "http://localhost:4360";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** A problem the person running the script has to fix (wrong token, missing scope, setup not finished). */
export class SeedAccessError extends Error {
	/** @param {string} message @param {string} [scope] set when the cause is a missing token scope */
	constructor(message, scope) {
		super(message);
		this.scope = scope;
	}
}

/** Origin, API base and auth mode from the environment; throws a SeedAccessError for an unusable combination. */
export const resolveTarget = (env = process.env) => {
	const origin = (env.EMDASH_URL || DEFAULT_ORIGIN).replace(/\/+$/, "");
	const token = (env.EMDASH_TOKEN || "").trim();
	let url;
	try {
		url = new URL(origin);
	} catch {
		throw new SeedAccessError(`EMDASH_URL is not a URL: ${origin}`);
	}
	if (token === "") return { origin, base: `${origin}/_emdash/api`, token: "", mode: AUTH_MODE.DEV };
	if (!token.startsWith(TOKEN_PREFIX)) {
		throw new SeedAccessError(`EMDASH_TOKEN is not a personal access token: it must start with ${TOKEN_PREFIX} (admin -> Settings -> API Tokens).`);
	}
	if (url.protocol !== "https:" && !LOOPBACK_HOSTS.has(url.hostname)) {
		throw new SeedAccessError(`Refusing to send an access token over ${url.protocol}//${url.hostname}: use an https:// EMDASH_URL.`);
	}
	return { origin, base: `${origin}/_emdash/api`, token, mode: AUTH_MODE.TOKEN };
};

const SCOPE_PATTERN = /Token lacks required scope: ([^"\\]+)/;

/** The scope a 403 INSUFFICIENT_SCOPE response names, or null for any other response. */
export const missingScopeOf = (status, text) => {
	if (status !== 403 || !text.includes("INSUFFICIENT_SCOPE")) return null;
	return text.match(SCOPE_PATTERN)?.[1]?.trim() ?? "(unknown)";
};

const scopeError = (scope) =>
	new SeedAccessError(
		`The token lacks the scope "${scope}". Create a token with the scopes the seed needs (docs/production.md, "Seeding a deployed site"; the admin scope grants all of them).`,
		scope,
	);

export const createClient = ({ target = resolveTarget(), fetchImpl = fetch } = {}) => {
	const { origin, base, token, mode } = target;
	let cookie = "";

	const storeCookies = (res) => {
		const pairs = res.headers.getSetCookie().map((line) => line.split(";")[0]);
		if (pairs.length === 0) return;
		const jar = new Map(cookie.split("; ").filter(Boolean).map((pair) => pair.split(/=(.*)/s).slice(0, 2)));
		for (const pair of pairs) {
			const [name, value] = pair.split(/=(.*)/s);
			jar.set(name, value);
		}
		cookie = [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
	};

	const authHeaders = () => (mode === AUTH_MODE.TOKEN ? { Authorization: `Bearer ${token}` } : { cookie });

	const devLogin = async () => {
		const dev = async (path) => {
			const res = await fetchImpl(`${origin}${path}`, { headers: { cookie }, signal: AbortSignal.timeout(60_000) });
			storeCookies(res);
			return { ok: res.ok, text: await res.text() };
		};
		let result = await dev("/_emdash/api/auth/dev-bypass");
		if (!result.ok && result.text.includes("SETUP_REQUIRED")) {
			// A fresh database: apply seed/seed.json (collections, sample content) through the dev setup, then sign in.
			await dev("/_emdash/api/setup/dev-bypass?content=1");
			result = await dev("/_emdash/api/auth/dev-bypass");
		}
		if (!result.ok) throw new Error(`dev login failed: ${result.text.slice(0, 300)}`);
	};

	const call = async (method, path, { body, form, retry = true } = {}) => {
		const headers = { "X-EmDash-Request": "1", ...authHeaders() };
		let payload;
		if (form) payload = form;
		else if (body !== undefined) {
			payload = JSON.stringify(body);
			headers["Content-Type"] = "application/json";
		}
		const res = await fetchImpl(`${base}${path}`, { method, headers, body: payload, signal: AbortSignal.timeout(180_000) });
		if (mode === AUTH_MODE.DEV) storeCookies(res);
		const text = await res.text();
		if (!res.ok) {
			const scope = missingScopeOf(res.status, text);
			if (scope !== null) throw scopeError(scope);
			if (mode === AUTH_MODE.TOKEN && res.status === 401) {
				throw new SeedAccessError("The site rejected EMDASH_TOKEN (invalid, revoked or expired). Create a new token in the admin.");
			}
			if (mode === AUTH_MODE.DEV && retry && (res.status === 401 || res.status === 403) && text.includes("NOT_AUTHENTICATED")) {
				await devLogin();
				return call(method, path, { body, form, retry: false });
			}
			throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 600)}`);
		}
		return text ? JSON.parse(text) : {};
	};

	/**
 * Token mode: the site must be set up already (a person finishes the wizard with a passkey). The token itself is
 * checked by the first call that uses it (the scope probes): /auth/me would need the admin scope.
 */
	const tokenLogin = async () => {
		let res;
		try {
			res = await fetchImpl(`${base}/setup/status`, { signal: AbortSignal.timeout(60_000) });
		} catch (error) {
			throw new SeedAccessError(`Cannot reach ${origin}: ${error instanceof Error ? error.message : error}`);
		}
		const status = res.ok ? ((await res.json()).data ?? {}) : {};
		if (status.needsSetup === true) {
			throw new SeedAccessError(
				`The setup wizard of ${origin} has not been completed. Open ${origin}/_emdash/admin, finish it with a passkey, create an API token (Settings -> API Tokens) and run this again.`,
			);
		}
	};

	const login = () => (mode === AUTH_MODE.TOKEN ? tokenLogin() : devLogin());

	return { mode, origin, login, call };
};

/** What the seed (or a part of it) needs from the token: probes that change nothing and answer a scope error first. */
export const SCOPE_PROBES = {
	"content:read": { method: "GET", path: "/content/home?limit=1" },
	"content:write": { method: "PUT", path: "/content/home/scope-probe", body: { data: {} } },
	"media:read": { method: "GET", path: "/media?limit=1" },
	"media:write": { method: "POST", path: "/media", form: () => new FormData() },
	"settings:manage": { method: "POST", path: "/settings", body: {} },
	admin: { method: "POST", path: "/plugins/stripe-commerce/admin/status", body: {} },
};

/**
 * Token mode only: before any write, ask each needed scope with a request that cannot change anything (an
 * invalid or empty one). Only a 403 INSUFFICIENT_SCOPE counts; any other answer (404, 400, 200) means the scope is held.
 * Throws a SeedAccessError naming every missing scope.
 */
export const preflightScopes = async (client, scopes, probes = SCOPE_PROBES) => {
	const missing = [];
	for (const scope of scopes) {
		const probe = probes[scope];
		try {
			await client.call(probe.method, probe.path, { body: probe.body, form: probe.form?.() });
		} catch (error) {
			if (!(error instanceof SeedAccessError)) continue;
			if (error.scope === undefined) throw error;
			missing.push(error.scope);
		}
	}
	if (missing.length > 0) {
		throw new SeedAccessError(
			`The token lacks ${missing.length === 1 ? "the scope" : "the scopes"}: ${[...new Set(missing)].join(", ")}. Nothing was changed. Create a token that has it (the admin scope grants everything) and run this again.`,
		);
	}
};
