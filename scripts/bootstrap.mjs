#!/usr/bin/env node
/**
 * First-run setup of a fresh clone, and a read-only health check.
 *
 *   pnpm bootstrap          prepares apps/storefront/.env (generates the encryption key, optionally takes a Stripe
 *                           sandbox key and fetches the webhook secret from the Stripe CLI), then prints what to run next
 *   pnpm doctor             the same checks, changes nothing, exits 1 when a required check fails
 *
 * Idempotent: a value that is already set is never overwritten. Secrets are never printed. A live Stripe key is refused.
 * Dependency-free (Node >= 24.22.1). The rules live in scripts/lib/bootstrap-env.mjs (unit-tested).
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

import {
	checkEnv,
	classifyStripeKey,
	encryptionKeyFrom,
	isNodeVersionAtLeast,
	isPlaceholder,
	isWebhookSecret,
	parseEnv,
	upsertEnv,
} from "./lib/bootstrap-env.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STOREFRONT = join(ROOT, "apps", "storefront");
const ENV_FILE = join(STOREFRONT, ".env");
const ENV_EXAMPLE = join(STOREFRONT, ".env.example");
const ORIGIN = (process.env.EMDASH_URL ?? "http://localhost:4360").replace(/\/+$/, "");

const isCheckOnly = process.argv.includes("--check");
const isInteractive = Boolean(process.stdin.isTTY && process.stdout.isTTY) && !process.argv.includes("--yes");

const results = [];
const report = (isOk, isRequired, message, hint) => {
	results.push({ isOk, isRequired });
	const mark = isOk ? "ok  " : isRequired ? "FAIL" : "todo";
	console.log(`[${mark}] ${message}`);
	if (!isOk && hint) console.log(`       ${hint}`);
};

const run = (command, args, options = {}) =>
	spawnSync(command, args, { encoding: "utf8", timeout: options.timeout ?? 15_000, cwd: ROOT });

const readEnv = () => (existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "");

const writeEnvValue = (key, value) => writeFileSync(ENV_FILE, upsertEnv(readEnv(), key, value));

// ---------------------------------------------------------------- 1. toolchain
const checkToolchain = () => {
	const required = readFileSync(join(ROOT, ".node-version"), "utf8").trim();
	report(
		isNodeVersionAtLeast(process.version, required),
		true,
		`Node ${process.version} (needs >= ${required})`,
		"Switch with your version manager (fnm use / nvm use / mise install); the repo's .node-version is the pin.",
	);
	const pnpm = run("pnpm", ["--version"]);
	report(pnpm.status === 0, true, `pnpm ${pnpm.status === 0 ? pnpm.stdout.trim() : "not found"} (needs 10)`, "Run: corepack enable");
	report(
		existsSync(join(ROOT, "node_modules", ".pnpm")),
		true,
		"Dependencies are installed",
		"Run: pnpm install",
	);
	report(
		existsSync(join(ROOT, "apps", "storefront", "public", "merch", "hero.png")),
		true,
		"The mock product art is present (apps/storefront/public/merch)",
		"Run: pnpm art",
	);
	const stripe = run("stripe", ["--version"]);
	report(
		stripe.status === 0,
		false,
		stripe.status === 0 ? "Stripe CLI found" : "Stripe CLI not found (needed for webhooks, so paid orders show up)",
		"Install: brew install stripe/stripe-cli/stripe, then: stripe login",
	);
	return stripe.status === 0;
};

// ---------------------------------------------------------------- 2. .env
const ensureEnvFile = () => {
	if (existsSync(ENV_FILE)) return;
	if (isCheckOnly) return;
	copyFileSync(ENV_EXAMPLE, ENV_FILE);
	console.log("Created apps/storefront/.env from .env.example");
};

const ensureEncryptionKey = () => {
	if (isCheckOnly || !isPlaceholder(parseEnv(readEnv()).EMDASH_ENCRYPTION_KEY)) return;
	writeEnvValue("EMDASH_ENCRYPTION_KEY", encryptionKeyFrom(randomBytes(32)));
	console.log("Generated EMDASH_ENCRYPTION_KEY (kept in .env; do not change it later, stored secrets depend on it)");
};

const ask = async (question) => {
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	try {
		return (await rl.question(question)).trim();
	} finally {
		rl.close();
	}
};

/** The sandbox key: from the shell environment, else (in a terminal) a prompt. A live key is refused either way. */
const ensureStripeKey = async () => {
	if (isCheckOnly || !isPlaceholder(parseEnv(readEnv()).STRIPE_SECRET_KEY)) return;
	let candidate = process.env.STRIPE_SECRET_KEY ?? "";
	if (candidate === "" && isInteractive) {
		candidate = await ask("Stripe SANDBOX secret key (sk_test_… or rk_test_…), Enter to skip: ");
	}
	if (candidate === "") return;
	const kind = classifyStripeKey(candidate);
	if (kind === "live") return console.log("Refused: that is a LIVE key. Local work uses a sandbox key only.");
	if (kind === "invalid") return console.log("Skipped: that does not look like a Stripe sandbox key (sk_test_… / rk_test_…).");
	writeEnvValue("STRIPE_SECRET_KEY", candidate);
	console.log("Saved STRIPE_SECRET_KEY to .env");
};

/** `stripe listen --print-secret` prints the signing secret of the logged-in CLI session and exits. */
const ensureWebhookSecret = (hasStripeCli) => {
	if (isCheckOnly || !hasStripeCli || !isPlaceholder(parseEnv(readEnv()).STRIPE_WEBHOOK_SECRET)) return;
	const result = run("stripe", ["listen", "--print-secret"], { timeout: 20_000 });
	const secret = (result.stdout ?? "").trim().split(/\s+/).find(isWebhookSecret);
	if (!secret) return console.log("Could not read a webhook secret from the Stripe CLI (run: stripe login). Put it in .env later.");
	writeEnvValue("STRIPE_WEBHOOK_SECRET", secret);
	console.log("Saved STRIPE_WEBHOOK_SECRET to .env (it belongs to this Stripe CLI login; a new login has another one)");
};

const reportEnv = () => {
	if (!existsSync(ENV_FILE)) {
		report(false, true, "apps/storefront/.env exists", "Run: pnpm bootstrap");
		return;
	}
	for (const check of checkEnv(parseEnv(readEnv()))) {
		const hint = check.id === "email-provider" ? "Optional locally; setup for a deployed site: docs/email.md. Only .env is read here, not admin settings or Worker secrets." : "Edit apps/storefront/.env, or run pnpm bootstrap in a terminal to be asked for it.";
		report(check.isOk, check.isRequired, check.message, hint);
	}
};

// ---------------------------------------------------------------- 3. server and catalog
const get = async (path) => {
	try {
		return await fetch(`${ORIGIN}${path}`, { signal: AbortSignal.timeout(4000) });
	} catch {
		return null;
	}
};

const reportServer = async () => {
	const home = await get("/");
	report(home !== null && home.status < 500, false, `The dev server answers at ${ORIGIN}`, "Run: pnpm dev");
	if (home === null) return;
	const catalog = await get("/_emdash/api/plugins/stripe-commerce/catalog/products?limit=1");
	const body = catalog?.ok ? await catalog.json().catch(() => null) : null;
	const count = body?.data?.items?.length ?? body?.items?.length ?? 0;
	report(count > 0, false, "The demo catalog is seeded", "Run: pnpm seed (the dev server must run)");
};

// ---------------------------------------------------------------- next steps
const printNextSteps = () => {
	console.log(`
Next steps
  1. pnpm dev                 start the shop on ${ORIGIN}
  2. stripe listen --forward-to localhost:4360/_emdash/api/plugins/stripe-commerce/webhook
                              keep it running in a second terminal (needed for orders)
  3. pnpm seed                create the mock Cloudflare merch catalog and sync it to Stripe
  4. restart the server once after the very first seed (npx astro dev stop in apps/storefront, then pnpm dev)
  5. open ${ORIGIN}/shop, pay with 4242 4242 4242 4242; admin: ${ORIGIN}/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin

Working with an AI agent: docs/ai-guide.md has the architecture map and ready prompts.`);
};

const main = async () => {
	console.log(isCheckOnly ? "Checking the setup (read-only)\n" : "Preparing this clone\n");
	const hasStripeCli = checkToolchain();
	ensureEnvFile();
	ensureEncryptionKey();
	await ensureStripeKey();
	ensureWebhookSecret(hasStripeCli);
	console.log("");
	reportEnv();
	if (isCheckOnly) await reportServer();
	const failed = results.filter((result) => !result.isOk && result.isRequired);
	const todo = results.filter((result) => !result.isOk && !result.isRequired);
	console.log(`\n${failed.length} required problem(s), ${todo.length} optional item(s) open.`);
	if (!isCheckOnly) printNextSteps();
	if (failed.length > 0) process.exitCode = 1;
};

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
