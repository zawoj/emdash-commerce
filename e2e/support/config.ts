import { join } from "node:path";

/** Repository root (this file is `e2e/support/config.ts`). */
export const ROOT = join(import.meta.dirname, "..", "..");
export const STOREFRONT_DIR = join(ROOT, "apps", "storefront");
export const SEED_SCRIPT = join(ROOT, "scripts", "seed-demo.mjs");

/** Which runtime the suite starts the storefront on. The specs are the same for both. */
export const TARGET_ENV = "E2E_TARGET";
export const E2E_TARGETS = { node: "node", cloudflare: "cloudflare" } as const;
export type E2eTarget = (typeof E2E_TARGETS)[keyof typeof E2E_TARGETS];

const resolveTarget = (value: string | undefined): E2eTarget => {
	if (!value) return E2E_TARGETS.node;
	const known = Object.values(E2E_TARGETS).find((target) => target === value);
	if (!known) throw new Error(`${TARGET_ENV}=${value} is not a target; use one of: ${Object.values(E2E_TARGETS).join(", ")}`);
	return known;
};

export const TARGET: E2eTarget = resolveTarget(process.env[TARGET_ENV]);
export const IS_CLOUDFLARE = TARGET === E2E_TARGETS.cloudflare;

/**
 * Everything one run creates (server state, uploads, logs). Deleted at the start of every run; git-ignored. Each target
 * has its own directory, so a Node run and a Cloudflare run in one checkout never delete each other's files.
 */
export const RUN_DIR = join(ROOT, IS_CLOUDFLARE ? ".e2e-cloudflare" : ".e2e");
export const DATABASE_FILE = join(RUN_DIR, "data.db");
export const UPLOADS_DIR = join(RUN_DIR, "uploads");
/** Cloudflare target: local D1, R2 and Durable Object state of the throwaway server (`persistState` of the adapter). */
export const CLOUDFLARE_STATE_DIR = join(RUN_DIR, "state");

/** 4360 is the dev server, so the suite uses its own ports: 4380 for Node, 4381 for Cloudflare. */
export const DEFAULT_PORTS = { [E2E_TARGETS.node]: 4380, [E2E_TARGETS.cloudflare]: 4381 } as const;
export const PORT = Number(process.env.E2E_PORT ?? DEFAULT_PORTS[TARGET]);
export const BASE_URL = `http://localhost:${PORT}`;
export const WEBHOOK_PATH = "/_emdash/api/plugins/stripe-commerce/webhook";
export const PLUGIN_API = "/_emdash/api/plugins/stripe-commerce";

/** The env var the global setup sets for the workers: "1" when the server runs with a Stripe sandbox key and a webhook forwarder. */
export const STRIPE_READY_ENV = "E2E_STRIPE_READY";
/** Why the Stripe suite is skipped (shown as the skip message). */
export const STRIPE_SKIP_REASON_ENV = "E2E_STRIPE_SKIP_REASON";
/** `off` starts the server without any Stripe key, whatever the environment holds (the smoke run). */
export const STRIPE_MODE_ENV = "E2E_STRIPE";

/** The runtime the global setup measured on the running server ("workerd" or "node"); asserted by `target.spec.ts`. */
export const RUNTIME_PROOF_ENV = "E2E_RUNTIME_PROOF";
