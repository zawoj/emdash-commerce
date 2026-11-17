import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import { BASE_URL, IS_CLOUDFLARE, PORT, RUN_DIR, RUNTIME_PROOF_ENV, STOREFRONT_DIR, STRIPE_MODE_ENV, STRIPE_READY_ENV, STRIPE_SKIP_REASON_ENV, TARGET, UPLOADS_DIR } from "./support/config";
import { isPortServed, type ManagedProcess } from "./support/processes";
import { makeEncryptionKey, measureRuntime, removeWorkerSecrets, seedCatalog, serverEnv, startServer, storeWebhookSecret, warmUp, writeWorkerSecrets, type StripeServerEnv } from "./support/server";
import { isStripeCliInstalled, readWebhookSecret, startListener } from "./support/stripe-cli";
import { readDotenvFile, resolveStripeKey, STRIPE_KEY_STATES } from "./support/stripe-mode";

const log = (message: string): void => console.log(`[e2e] ${message}`);

interface StripePlan {
	stripe?: StripeServerEnv;
	secretKey?: string;
	skipReason?: string;
}

/** Decides whether this run has a Stripe sandbox: key, CLI and the CLI's webhook secret. Never prints a key. */
const planStripe = (): StripePlan => {
	const resolution = resolveStripeKey({
		mode: process.env[STRIPE_MODE_ENV],
		env: process.env,
		dotenvText: readDotenvFile(join(STOREFRONT_DIR, ".env")),
	});
	if (resolution.state === STRIPE_KEY_STATES.disabled) return { skipReason: `${STRIPE_MODE_ENV}=off: the server runs without a Stripe key` };
	if (resolution.state === STRIPE_KEY_STATES.missing) return { skipReason: "STRIPE_SECRET_KEY is not set (an sk_test_ or rk_test_ key is needed for the purchase suite)" };
	if (resolution.state === STRIPE_KEY_STATES.refused || !resolution.key) {
		throw new Error("STRIPE_SECRET_KEY is not a Stripe sandbox key (sk_test_... or rk_test_...). The e2e suite refuses to run with it.");
	}
	if (!isStripeCliInstalled()) return { skipReason: "the Stripe CLI is not installed (https://docs.stripe.com/stripe-cli), so webhooks cannot be forwarded" };
	const webhookSecret = readWebhookSecret(resolution.key);
	if (!webhookSecret) return { skipReason: "`stripe listen --print-secret` failed for this key (wrong account, no network or an expired CLI login)" };
	return { secretKey: resolution.key, stripe: { secretKey: resolution.key, webhookSecret } };
};

const globalSetup = async (): Promise<() => Promise<void>> => {
	if (await isPortServed(`${BASE_URL}/`)) {
		throw new Error(`Port ${PORT} is already in use. Stop whatever listens there or set E2E_PORT; the suite starts its own server.`);
	}
	rmSync(RUN_DIR, { recursive: true, force: true });
	mkdirSync(UPLOADS_DIR, { recursive: true });

	const plan = planStripe();
	process.env[STRIPE_READY_ENV] = plan.stripe ? "1" : "0";
	process.env[STRIPE_SKIP_REASON_ENV] = plan.skipReason ?? "";
	log(plan.stripe ? "Stripe sandbox: on (the catalog is synced to Stripe, webhooks are forwarded)" : `Stripe: off. ${plan.skipReason ?? ""}`);

	const started: ManagedProcess[] = [];
	const teardown = async (): Promise<void> => {
		for (const proc of started.splice(0).toReversed()) await proc.stop();
		if (IS_CLOUDFLARE) removeWorkerSecrets();
	};
	// Safety net like the process groups': the secrets file must not outlive a run that dies without its teardown.
	if (IS_CLOUDFLARE) process.once("exit", removeWorkerSecrets);

	try {
		if (plan.secretKey) started.push(await startListener(plan.secretKey));
		const serverInput = { encryptionKey: makeEncryptionKey(), stripe: plan.stripe };
		const env = serverEnv(serverInput);
		if (IS_CLOUDFLARE) {
			// workerd reads its secrets from a file, not from the environment of the process (see writeWorkerSecrets).
			writeWorkerSecrets(serverInput);
		}
		log(`target: ${TARGET}`);

		// The seed needs the dev login (`astro dev` only). EmDash reads the site URL when the server starts and the first
		// seed on an empty database is what stores it, so the server is restarted once before any test runs.
		let server = await startServer(env, "server-first.log");
		started.push(server);
		// Before the seed, so the webhooks the catalog sync causes are verified (a 503 would only be Stripe's retry noise).
		if (IS_CLOUDFLARE && plan.stripe) await storeWebhookSecret(plan.stripe.webhookSecret);
		log("seeding the demo catalog (with a Stripe key this also syncs it to Stripe: a few minutes)");
		await seedCatalog(env);
		await server.stop();
		started.splice(started.indexOf(server), 1);
		server = await startServer(env, "server.log");
		started.push(server);
		await warmUp();
		const runtime = measureRuntime(server);
		process.env[RUNTIME_PROOF_ENV] = runtime;
		log(`runtime of the server: ${runtime}`);
		log(`ready on ${BASE_URL}; logs and the database are in ${RUN_DIR}`);
	} catch (error) {
		await teardown();
		throw error;
	}
	return teardown;
};

export default globalSetup;
