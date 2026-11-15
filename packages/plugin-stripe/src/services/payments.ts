import type { ProviderPayment } from "../ports/payment-provider.js";
import { RECORD_INDEX_KEY } from "../ports/repositories.js";
import { HANDLED, ignored, isCreatedByPlugin, type Deps, type HandlerResult } from "./payments/deps.js";
import { upsertPaymentByIntent } from "./payments/payment-records.js";

export { upsertPaymentByIntent, type LoadedPayment, type PaymentLink } from "./payments/payment-records.js";

/**
 * `payment_intent.*` events. The event only says "something changed": the current state is retrieved at the
 * moment the record is locked, so out-of-order or duplicate events all converge on what Stripe reports now.
 * Intents this plugin did not create (no checkout metadata, no payment record yet) are ignored; renewal
 * payments of a subscription are recorded by the invoice handler, after which their events update here.
 */
export const handlePaymentUpdated = async ({ container }: Deps, snapshot: ProviderPayment): Promise<HandlerResult> => {
	const isKnown = Boolean(await container.recordIndex.get(RECORD_INDEX_KEY.paymentByPaymentIntent(snapshot.paymentIntentId)));
	if (!isKnown && !isCreatedByPlugin(snapshot.metadata)) return ignored("Payment intent was not created by this store");
	const provider = await container.provider();
	await upsertPaymentByIntent(container, snapshot.paymentIntentId, async () => {
		const fresh = await provider.payments.retrievePayment(snapshot.paymentIntentId);
		return fresh ? { payment: fresh, isFresh: true } : { payment: snapshot, isFresh: false };
	});
	return HANDLED;
};
