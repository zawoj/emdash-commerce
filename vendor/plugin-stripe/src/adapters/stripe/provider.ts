import type { PaymentProvider } from "../../ports/payment-provider.js";
import { describeStripeAccount } from "./account.js";
import { createCatalogProvider } from "./catalog.js";
import { createCheckoutProvider } from "./checkout.js";
import { getStripeClient, type StripeProviderConfig } from "./client.js";
import { createCustomersProvider } from "./customers.js";
import { createPaymentsProvider } from "./payments.js";
import { createSubscriptionsProvider } from "./subscriptions.js";
import { createWebhooksProvider } from "./webhooks.js";

/**
 * The Stripe implementation of the payment provider port. The SDK client is created lazily on first use,
 * so building the provider never fails (webhook verification works without an API key).
 */
export const createStripeProvider = (config: StripeProviderConfig): PaymentProvider => {
	const getClient = () => getStripeClient(config);
	return {
		id: "stripe",
		catalog: createCatalogProvider(getClient),
		checkout: createCheckoutProvider(getClient, {
			integrationIdentifier: config.integrationIdentifier,
			...(config.log ? { onSkipped: (skipped) => config.log?.warn("Checkout options skipped for this session mode", { skipped }) } : {}),
		}),
		payments: createPaymentsProvider(getClient),
		customers: createCustomersProvider(getClient),
		subscriptions: createSubscriptionsProvider(getClient),
		webhooks: createWebhooksProvider(getClient, {
			webhookSecret: config.webhookSecret,
			...(config.log ? { onUnmappable: (info) => config.log?.warn("Stripe event could not be mapped and is treated as unsupported", { ...info }) } : {}),
		}),
		describeAccount: () => describeStripeAccount(getClient, config.secretKey),
	};
};
