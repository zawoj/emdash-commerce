import { randomBytes } from "node:crypto";
import { join } from "node:path";

import { BASE_URL, DATABASE_FILE, PORT, RUN_DIR, SEED_SCRIPT, STOREFRONT_DIR, UPLOADS_DIR } from "./config";
import { runToCompletion, spawnManaged, waitForHttp, type ManagedProcess } from "./processes";

const SERVER_START_TIMEOUT_MS = 120_000;
const SEED_TIMEOUT_MS = 600_000;
/** Cold Vite compiles are slow; every route a spec opens first is requested once here, so no test pays for it. */
const WARM_UP_PATHS = ["/", "/shop", "/shop/workers-tee", "/shop/sticker-pack", "/cart", "/orders/lookup", "/orders/view", "/search", "/posts", "/rss.xml", "/404"];

/** Variables the host may hold that would change which database, runtime or Stripe account the run talks to. */
const FOREIGN_ENV = /^(STRIPE_|EMDASH_|COMMERCE_|DEPLOY_TARGET$)/;

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

export const serverEnv = ({ encryptionKey, stripe }: ServerEnvInput): NodeJS.ProcessEnv => ({
	...baseEnv(),
	// Astro 7 detaches `astro dev` when it detects an AI agent; the suite needs the process it started.
	ASTRO_DEV_BACKGROUND: "1",
	EMDASH_DATABASE_FILE: DATABASE_FILE,
	EMDASH_UPLOADS_DIR: UPLOADS_DIR,
	EMDASH_ENCRYPTION_KEY: encryptionKey,
	...(stripe ? { STRIPE_SECRET_KEY: stripe.secretKey, STRIPE_WEBHOOK_SECRET: stripe.webhookSecret } : {}),
});

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

export const warmUp = async (): Promise<void> => {
	for (const path of WARM_UP_PATHS) {
		const response = await fetch(`${BASE_URL}${path}`, { redirect: "manual", signal: AbortSignal.timeout(90_000) });
		await response.arrayBuffer();
	}
};
