import Stripe from "stripe";

import { ProviderError } from "../../ports/payment-provider.js";
import {
	STRIPE_API_VERSION,
	STRIPE_APP_NAME,
	STRIPE_MAX_NETWORK_RETRIES,
	STRIPE_TIMEOUT_MS,
} from "./constants.js";

export interface StripeProviderConfig {
	secretKey: string;
	/** Null until the webhook endpoint is registered; verification then fails with `WebhookSignatureError`. */
	webhookSecret: string | null;
	/** Sent as `integration_identifier` on Checkout Sessions. */
	integrationIdentifier: string;
	/** Sent in `appInfo.version`. */
	appVersion: string;
	/** Where adapter warnings go (an unmappable webhook event); defaults to `console.warn`. */
	log?: { warn(message: string, meta?: Record<string, unknown>): void };
}

// One client per key (and app version): the SDK keeps a connection pool and telemetry per instance.
const clients = new Map<string, Stripe>();

const clientKey = (secretKey: string, appVersion: string): string => `${appVersion}\u0000${secretKey}`;

/**
 * The fetch HTTP client keeps the SDK free of `node:http`, so the adapter runs on Workers as well.
 * The key is read only here and never copied into an error message.
 */
export const getStripeClient = (config: Pick<StripeProviderConfig, "secretKey" | "appVersion">): Stripe => {
	const key = clientKey(config.secretKey, config.appVersion);
	const cached = clients.get(key);
	if (cached) return cached;
	if (config.secretKey.trim() === "") {
		throw new ProviderError("Stripe secret key is not configured", { isRetryable: false, providerCode: "not_configured" });
	}
	const client = new Stripe(config.secretKey, {
		apiVersion: STRIPE_API_VERSION,
		httpClient: Stripe.createFetchHttpClient(),
		maxNetworkRetries: STRIPE_MAX_NETWORK_RETRIES,
		timeout: STRIPE_TIMEOUT_MS,
		appInfo: { name: STRIPE_APP_NAME, version: config.appVersion },
	});
	clients.set(key, client);
	return client;
};

/** For tests: forget cached clients. */
export const resetStripeClients = (): void => {
	clients.clear();
};

let subtleCrypto: Stripe.CryptoProvider | null = null;

/** Web Crypto based HMAC for webhook verification (no `node:crypto`). */
export const getCryptoProvider = (): Stripe.CryptoProvider => {
	subtleCrypto ??= Stripe.createSubtleCryptoProvider();
	return subtleCrypto;
};
