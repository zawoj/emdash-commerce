// @vitest-environment node
import { describe, expect, it } from "vitest";

import { AUTH_MODE, createClient, missingScopeOf, preflightScopes, resolveTarget, SeedAccessError } from "./emdash-client.mjs";

const TOKEN = "ec_pat_secret-value-for-tests";
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const scopeDenied = (scope) => json(403, { error: { code: "INSUFFICIENT_SCOPE", message: `Token lacks required scope: ${scope}` } });

/** A fake site: answers per "METHOD path", records every request. */
const site = (routes) => {
	const requests = [];
	const fetchImpl = async (url, init = {}) => {
		const { pathname, search } = new URL(url);
		requests.push({ method: init.method ?? "GET", path: pathname + search, headers: init.headers ?? {} });
		const handler = routes[`${init.method ?? "GET"} ${pathname.replace("/_emdash/api", "")}`];
		return handler ? handler(init) : json(404, { error: { code: "NOT_FOUND" } });
	};
	return { fetchImpl, requests };
};

describe("resolveTarget", () => {
	it("uses the dev login without a token", () => {
		expect(resolveTarget({}).mode).toBe(AUTH_MODE.DEV);
		expect(resolveTarget({ EMDASH_URL: "http://localhost:4366/" }).origin).toBe("http://localhost:4366");
	});

	it("uses the token mode when EMDASH_TOKEN is set", () => {
		expect(resolveTarget({ EMDASH_URL: "https://shop.example", EMDASH_TOKEN: TOKEN }).mode).toBe(AUTH_MODE.TOKEN);
	});

	it("refuses a value that is not a personal access token, without printing it", () => {
		const attempt = () => resolveTarget({ EMDASH_TOKEN: "sk_test_abc" });
		expect(attempt).toThrow(/must start with ec_pat_/);
		expect(attempt).not.toThrow(/sk_test_abc/);
	});

	it("refuses to send a token over plain http to a remote host, but allows loopback", () => {
		expect(() => resolveTarget({ EMDASH_URL: "http://shop.example", EMDASH_TOKEN: TOKEN })).toThrow(/https/);
		expect(resolveTarget({ EMDASH_URL: "http://localhost:4366", EMDASH_TOKEN: TOKEN }).mode).toBe(AUTH_MODE.TOKEN);
	});
});

describe("token mode", () => {
	const target = resolveTarget({ EMDASH_URL: "https://shop.example", EMDASH_TOKEN: TOKEN });

	it("sends the bearer header and never touches a dev route or a cookie", async () => {
		const { fetchImpl, requests } = site({
			"GET /setup/status": () => json(200, { data: { needsSetup: false } }),
			"GET /content/home": () => json(200, { data: { items: [] } }),
		});
		const client = createClient({ target, fetchImpl });
		await client.login();
		await client.call("GET", "/content/home");
		expect(requests.map((r) => r.path)).toEqual(["/_emdash/api/setup/status", "/_emdash/api/content/home"]);
		expect(requests.some((r) => r.path.includes("dev-bypass"))).toBe(false);
		expect(requests.slice(1).every((r) => r.headers.Authorization === `Bearer ${TOKEN}` && r.headers.cookie === undefined)).toBe(true);
	});

	it("stops with a clear message when the setup wizard is not completed", async () => {
		const { fetchImpl, requests } = site({ "GET /setup/status": () => json(200, { data: { needsSetup: true } }) });
		await expect(createClient({ target, fetchImpl }).login()).rejects.toThrow(/setup wizard .* has not been completed/);
		expect(requests).toHaveLength(1);
	});

	it("names a rejected token without echoing it", async () => {
		const { fetchImpl } = site({ "GET /content/home": () => json(401, { error: { code: "NOT_AUTHENTICATED" } }) });
		const error = await createClient({ target, fetchImpl }).call("GET", "/content/home").catch((e) => e);
		expect(error).toBeInstanceOf(SeedAccessError);
		expect(error.message).toMatch(/rejected EMDASH_TOKEN/);
		expect(error.message).not.toContain(TOKEN);
	});

	it("turns a 403 INSUFFICIENT_SCOPE into an error naming the scope", async () => {
		const { fetchImpl } = site({ "POST /plugins/stripe-commerce/admin/status": () => scopeDenied("admin") });
		const error = await createClient({ target, fetchImpl }).call("POST", "/plugins/stripe-commerce/admin/status", { body: {} }).catch((e) => e);
		expect(error.scope).toBe("admin");
		expect(error.message).toContain('"admin"');
	});
});

describe("dev mode", () => {
	it("signs in through dev-bypass and replays the cookie", async () => {
		const { fetchImpl, requests } = site({
			"GET /auth/dev-bypass": () => new Response("{}", { status: 200, headers: { "set-cookie": "session=abc; Path=/" } }),
			"GET /content/home": () => json(200, {}),
		});
		const client = createClient({ target: resolveTarget({}), fetchImpl });
		await client.login();
		await client.call("GET", "/content/home");
		expect(requests[0].path).toContain("dev-bypass");
		expect(requests[1].headers.cookie).toBe("session=abc");
		expect(requests[1].headers.Authorization).toBeUndefined();
	});
});

describe("missingScopeOf", () => {
	it("reads the scope of an INSUFFICIENT_SCOPE 403 only", () => {
		expect(missingScopeOf(403, '{"error":{"code":"INSUFFICIENT_SCOPE","message":"Token lacks required scope: media:write"}}')).toBe("media:write");
		expect(missingScopeOf(403, '{"error":{"code":"FORBIDDEN"}}')).toBeNull();
		expect(missingScopeOf(404, "INSUFFICIENT_SCOPE")).toBeNull();
	});
});

describe("preflightScopes", () => {
	const target = resolveTarget({ EMDASH_URL: "https://shop.example", EMDASH_TOKEN: TOKEN });
	const probes = {
		"content:write": { method: "PUT", path: "/content/home/probe", body: {} },
		"media:write": { method: "POST", path: "/media", form: () => new FormData() },
		admin: { method: "POST", path: "/admin", body: {} },
	};

	it("passes when only non-scope errors come back (the probe request itself is invalid)", async () => {
		const { fetchImpl } = site({}); // every probe answers 404
		await expect(preflightScopes(createClient({ target, fetchImpl }), Object.keys(probes), probes)).resolves.toBeUndefined();
	});

	it("lists every missing scope in one message", async () => {
		const { fetchImpl } = site({
			"POST /media": () => scopeDenied("media:write"),
			"POST /admin": () => scopeDenied("admin"),
		});
		const error = await preflightScopes(createClient({ target, fetchImpl }), Object.keys(probes), probes).catch((e) => e);
		expect(error.message).toMatch(/lacks the scopes: media:write, admin/);
	});

	it("lets a rejected token surface as it is", async () => {
		const { fetchImpl } = site({ "PUT /content/home/probe": () => json(401, {}) });
		await expect(preflightScopes(createClient({ target, fetchImpl }), ["content:write"], probes)).rejects.toThrow(/rejected EMDASH_TOKEN/);
	});
});
