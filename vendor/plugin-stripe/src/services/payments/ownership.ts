import type { CommerceContainer } from "../../plugin/container.js";
import { PROVIDER_METADATA } from "../../ports/payment-provider.js";

/**
 * A refund or dispute can reach us before settlement has recorded the order it belongs to: Stripe sends
 * `charge.dispute.created` in the same second as `checkout.session.completed` for an instant chargeback, and
 * the events race. "No order yet" is then not "not ours": the PaymentIntent carries our checkout metadata. Such
 * an event must be retried (throw → inbox backoff, and a 500 so Stripe retries too), never dropped as ignored.
 */
export const isPaymentOfThisStore = async (container: CommerceContainer, paymentIntentId: string | null): Promise<boolean> => {
	if (!paymentIntentId) return false;
	const payment = await (await container.provider()).payments.retrievePayment(paymentIntentId);
	if (!payment) return false;
	return Boolean(payment.metadata[PROVIDER_METADATA.checkoutId] || payment.metadata[PROVIDER_METADATA.cartId]);
};

export class SettlementPendingError extends Error {
	constructor(what: string, paymentIntentId: string) {
		super(`${what} for payment ${paymentIntentId} arrived before its order was recorded; it will be retried`);
		this.name = "SettlementPendingError";
	}
}
