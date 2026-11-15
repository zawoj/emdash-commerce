import type Stripe from "stripe";

import { PROVIDER_METADATA, type PaymentsProvider } from "../../ports/payment-provider.js";
import { ADAPTER_METADATA, PLUGIN_METADATA_VALUE } from "./constants.js";
import { callStripe, retrieveStripe } from "./errors.js";
import { PAYMENT_RETRIEVE_EXPAND, toProviderPayment, toProviderRefund } from "./mappers/payment.js";

export const createPaymentsProvider = (getClient: () => Stripe): PaymentsProvider => ({
	async retrievePayment(paymentIntentId) {
		const intent = await retrieveStripe("payment retrieve", () =>
			getClient().paymentIntents.retrieve(paymentIntentId, { expand: [...PAYMENT_RETRIEVE_EXPAND] }),
		);
		return intent ? toProviderPayment(intent) : null;
	},

	/** The refund record id travels in metadata so `refund.*` events can be matched to our record (and to nothing else). */
	async createRefund(input, idempotencyKey) {
		const refund = await callStripe("refund create", () =>
			getClient().refunds.create(
				{
					payment_intent: input.paymentIntentId,
					amount: input.amount,
					...(input.reason ? { reason: input.reason } : {}),
					metadata: {
						[ADAPTER_METADATA.refundRecordId]: input.refundRecordId,
						[PROVIDER_METADATA.pluginId]: PLUGIN_METADATA_VALUE,
					},
				},
				{ idempotencyKey },
			),
		);
		return toProviderRefund(refund);
	},
});
