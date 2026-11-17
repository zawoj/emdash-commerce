import { join } from "node:path";

/** Repository root (this file is `e2e/support/config.ts`). */
export const ROOT = join(import.meta.dirname, "..", "..");
export const STOREFRONT_DIR = join(ROOT, "apps", "storefront");
export const SEED_SCRIPT = join(ROOT, "scripts", "seed-demo.mjs");

/** Everything one run creates (server database, uploads, logs). Deleted at the start of every run; git-ignored. */
export const RUN_DIR = join(ROOT, ".e2e");
export const DATABASE_FILE = join(RUN_DIR, "data.db");
export const UPLOADS_DIR = join(RUN_DIR, "uploads");

/** 4360 is the dev server, so the suite uses its own port. */
export const PORT = Number(process.env.E2E_PORT ?? 4380);
export const BASE_URL = `http://localhost:${PORT}`;
export const WEBHOOK_PATH = "/_emdash/api/plugins/stripe-commerce/webhook";
export const PLUGIN_API = "/_emdash/api/plugins/stripe-commerce";

/** The env var the global setup sets for the workers: "1" when the server runs with a Stripe sandbox key and a webhook forwarder. */
export const STRIPE_READY_ENV = "E2E_STRIPE_READY";
/** Why the Stripe suite is skipped (shown as the skip message). */
export const STRIPE_SKIP_REASON_ENV = "E2E_STRIPE_SKIP_REASON";
/** `off` starts the server without any Stripe key, whatever the environment holds (the smoke run). */
export const STRIPE_MODE_ENV = "E2E_STRIPE";
