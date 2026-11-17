import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { BASE_URL, CLOUDFLARE_STATE_DIR, DATABASE_FILE, E2E_TARGETS, IS_CLOUDFLARE, PORT, RUN_DIR, SEED_SCRIPT, STOREFRONT_DIR, UPLOADS_DIR } from "./config";
import { runToCompletion, spawnManaged, waitForHttp, type ManagedProcess } from "./processes";

const SERVER_START_TIMEOUT_MS = 120_000;
const SEED_TIMEOUT_MS = 600_000;
/** Cold Vite compiles are slow; every route a spec opens first is requested once here, so no test pays for it. */
const WARM_UP_PATHS = ["/", "/shop", "/shop/workers-tee", "/shop/sticker-pack", "/cart", "/orders/lookup", "/orders/view", "/search", "/posts", "/rss.xml", "/404"];

/** Variables the host may hold that would change which database, runtime or Stripe account the run talks to. */
const FOREIGN_ENV = /^(STRIPE_|EMDASH_|COMMERCE_|CLOUDFLARE_|WRANGLER_|DEPLOY_TARGET$)/;

export interface StripeServerEnv {
	secretKey: string;
	webhookSecret: string;
}

/** EmDash's own key format: `emdash_enc_v1_` + 32 random bytes as 43 base64url characters. A new one per run. */
export const makeEncryptionKey = (): string => `emdash_enc_v1_${randomBytes(32).toString("base64url")}`;

const baseEnv = (): NodeJS.ProcessEnv => {
	const env: NodeJS.ProcessEnv = {};
	for (const [name, value] of Object.entries(process.env)) if (!FOREIGN_ENV.test(name)) env[name] = value;
	return env;
};

export interface ServerEnvInput {
	encryptionKey: string;
	stripe?: StripeServerEnv;
}

/**
 * Cloudflare target: the secrets of the Worker. workerd does not see the server's own environment, only what wrangler
 * loads (`.dev.vars`, or the storefront's `.env`, which holds the developer's own keys). `CLOUDFLARE_ENV=e2e` makes
 * wrangler read `.dev.vars.e2e` first, and a found file means `.env` is not read at all, so a keyless run stays keyless.
 * The file is ignored by version control (`.dev.vars.*`), written with mode 600 and deleted by the teardown.
 */
export const CLOUDFLARE_ENV_NAME = "e2e";
const DEV_VARS_FILE = join(STOREFRONT_DIR, `.dev.vars.${CLOUDFLARE_ENV_NAME}`);

export const writeWorkerSecrets = ({ encryptionKey, stripe }: ServerEnvInput): void => {
	const lines = [`EMDASH_ENCRYPTION_KEY=${encryptionKey}`];
	if (stripe) lines.push(`STRIPE_SECRET_KEY=${stripe.secretKey}`);
	writeFileSync(DEV_VARS_FILE, `${lines.join("\n")}\n`, { mode: 0o600 });
};

export const removeWorkerSecrets = (): void => rmSync(DEV_VARS_FILE, { force: true });

const targetEnv = (input: ServerEnvInput): NodeJS.ProcessEnv => {
	if (!IS_CLOUDFLARE) {
		return {
			EMDASH_DATABASE_FILE: DATABASE_FILE,
			EMDASH_UPLOADS_DIR: UPLOADS_DIR,
			EMDASH_ENCRYPTION_KEY: input.encryptionKey,
			...(input.stripe ? { STRIPE_SECRET_KEY: input.stripe.secretKey, STRIPE_WEBHOOK_SECRET: input.stripe.webhookSecret } : {}),
		};
	}
	return { DEPLOY_TARGET: E2E_TARGETS.cloudflare, CLOUDFLARE_ENV: CLOUDFLARE_ENV_NAME, EMDASH_CLOUDFLARE_STATE_DIR: CLOUDFLARE_STATE_DIR };
};

export const serverEnv = (input: ServerEnvInput): NodeJS.ProcessEnv => ({
	...baseEnv(),
	// Astro 7 detaches `astro dev` when it detects an AI agent; the suite needs the process it started.
	ASTRO_DEV_BACKGROUND: "1",
	...targetEnv(input),
});

export const RUNTIMES = { node: "node", workerd: "workerd" } as const;
export type Runtime = (typeof RUNTIMES)[keyof typeof RUNTIMES];

/**
 * Which runtime the started server really is, read from its process group: `astro dev` on the Cloudflare target runs the
 * Worker in a `workerd` child, on Node there is none. It is measured, not assumed from the target setting, so a switch that
 * silently started the wrong server shows up (`target.spec.ts`).
 */
export const measureRuntime = (server: ManagedProcess): Runtime => {
	const pid = server.child.pid;
	const listing = spawnSync("ps", ["-axo", "pgid=,command="], { encoding: "utf8" }).stdout;
	const isWorkerd = listing.split("\n").some((line) => {
		const match = line.trim().match(/^(\d+)\s+(.*)$/);
		return match !== null && Number(match[1]) === pid && /(^|\/)workerd(\s|$)/.test(match[2] ?? "");
	});
	return isWorkerd ? RUNTIMES.workerd : RUNTIMES.node;
};

/** The storefront dev server on the suite's port. The `dev` script is not used: it would load `apps/storefront/.env`. */
export const startServer = async (env: NodeJS.ProcessEnv, logName: string): Promise<ManagedProcess> => {
	const astro = join(STOREFRONT_DIR, "node_modules", "astro", "bin", "astro.mjs");
	const server = spawnManaged({
		name: "storefront dev server",
		command: process.execPath,
		args: [astro, "dev", "--port", String(PORT), "--ignore-lock"],
		env,
		cwd: STOREFRONT_DIR,
		logFile: join(RUN_DIR, logName),
	});
	try {
		await waitForHttp(`${BASE_URL}/`, server, SERVER_START_TIMEOUT_MS);
	} catch (error) {
		await server.stop();
		throw error;
	}
	return server;
};

/** `pnpm seed` against the suite's server. With a Stripe key it also syncs the catalog to Stripe and waits for it. */
export const seedCatalog = async (env: NodeJS.ProcessEnv): Promise<void> => {
	const logFile = join(RUN_DIR, "seed.log");
	const code = await runToCompletion({
		command: process.execPath,
		args: [SEED_SCRIPT],
		env: { ...env, EMDASH_URL: BASE_URL, SEED_SYNC_TIMEOUT_SECONDS: "540" },
		cwd: STOREFRONT_DIR,
		logFile,
		timeoutMs: SEED_TIMEOUT_MS,
	});
	if (code !== 0) throw new Error(`the seed script failed (exit ${code}); see ${logFile}`);
};

/**
 * Cloudflare target with Stripe: hands the webhook signing secret to the plugin as an encrypted plugin setting, the way
 * "Register webhook" stores it on a deployed site. Not through the environment: `wrangler.jsonc` declares `secrets`, and
 * wrangler then passes a local secret to the Worker only when it is listed as required (`STRIPE_WEBHOOK_SECRET` is
 * optional), so a `STRIPE_WEBHOOK_SECRET` in `.dev.vars` never reaches the plugin and every webhook answers 503.
 */
export const storeWebhookSecret = async (webhookSecret: string): Promise<void> => {
	const signIn = (): Promise<Response> => fetch(`${BASE_URL}/_emdash/api/auth/dev-bypass`, { redirect: "manual" });
	let login = await signIn();
	if (!login.ok) {
		// A fresh database: the dev setup (what the seed does first) applies seed/seed.json and creates the dev admin.
		await fetch(`${BASE_URL}/_emdash/api/setup/dev-bypass?content=1`, { redirect: "manual" });
		login = await signIn();
	}
	const cookie = login.headers
		.getSetCookie()
		.map((entry) => entry.split(";")[0])
		.join("; ");
	if (!login.ok || !cookie) throw new Error(`dev login failed (${login.status}); cannot store the webhook secret`);
	const response = await fetch(`${BASE_URL}/_emdash/api/admin/plugins/stripe-commerce/settings`, {
		method: "PUT",
		headers: { "Content-Type": "application/json", "X-EmDash-Request": "1", cookie },
		body: JSON.stringify({ values: { stripeWebhookSecret: webhookSecret } }),
	});
	if (!response.ok) throw new Error(`storing the webhook secret failed (${response.status}): ${(await response.text()).slice(0, 200).replaceAll(webhookSecret, "[redacted]")}`);
};

export const warmUp = async (): Promise<void> => {
	for (const path of WARM_UP_PATHS) {
		const response = await fetch(`${BASE_URL}${path}`, { redirect: "manual", signal: AbortSignal.timeout(90_000) });
		await response.arrayBuffer();
	}
};
