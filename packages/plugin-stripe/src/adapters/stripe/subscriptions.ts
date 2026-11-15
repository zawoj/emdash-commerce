import type Stripe from "stripe";

import type { SubscriptionsProvider } from "../../ports/payment-provider.js";
import { callStripe, retrieveStripe } from "./errors.js";
import { INVOICE_RETRIEVE_EXPAND, toProviderInvoice, toProviderSubscription } from "./mappers/subscription.js";

export const createSubscriptionsProvider = (getClient: () => Stripe): SubscriptionsProvider => ({
	async retrieveSubscription(subscriptionId) {
		const subscription = await retrieveStripe("subscription retrieve", () => getClient().subscriptions.retrieve(subscriptionId));
		return subscription ? toProviderSubscription(subscription) : null;
	},

	/** At period end the subscription keeps running until then (`cancel_at_period_end`); otherwise it is canceled now. */
	async cancelSubscription(subscriptionId, options, idempotencyKey) {
		const subscription = await callStripe("subscription cancel", () =>
			options.atPeriodEnd
				? getClient().subscriptions.update(subscriptionId, { cancel_at_period_end: true }, { idempotencyKey })
				: getClient().subscriptions.cancel(subscriptionId, undefined, { idempotencyKey }),
		);
		return toProviderSubscription(subscription);
	},

	async retrieveInvoice(invoiceId) {
		const invoice = await retrieveStripe("invoice retrieve", () =>
			getClient().invoices.retrieve(invoiceId, { expand: [...INVOICE_RETRIEVE_EXPAND] }),
		);
		return invoice ? toProviderInvoice(invoice) : null;
	},
});
