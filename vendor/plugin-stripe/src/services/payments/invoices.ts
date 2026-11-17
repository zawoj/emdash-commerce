import { PAYMENT_PURPOSE, PAYMENT_STATUS, type Payment, type PaymentPurpose } from "../../core/payment.js";
import type { CommerceContainer } from "../../plugin/container.js";
import type { ProviderInvoice, ProviderPayment } from "../../ports/payment-provider.js";
import { RECORD_INDEX_KEY } from "../../ports/repositories.js";
import { ensureSubscriptionRecord } from "../subscriptions.js";
import { HANDLED, ignored, makeEvent, type Deps, type HandlerResult } from "./deps.js";
import { upsertPaymentByIntent } from "./payment-records.js";

/** Stripe's `billing_reason` of the invoice that starts a subscription (the checkout's own payment). */
const FIRST_INVOICE_REASON = "subscription_create";

export const isFirstInvoice = (invoice: Pick<ProviderInvoice, "billingReason">): boolean => invoice.billingReason === FIRST_INVOICE_REASON;

const paymentFromInvoice = (invoice: ProviderInvoice, paymentIntentId: string): ProviderPayment => ({
	paymentIntentId,
	status: PAYMENT_STATUS.succeeded,
	amount: invoice.amountPaid,
	amountRefunded: 0,
	currency: invoice.currency,
	latestChargeId: invoice.chargeId,
	methodType: null,
	failureCode: null,
	failureMessage: null,
	metadata: {},
});

/**
 * Records the payment of a paid invoice, once: the PaymentIntent is the key (`paymentByPaymentIntent`), and
 * the invoice index is set beside it so either side finds the same record. The checkout's own invoice
 * (`subscription_create`) belongs to the initial order; every other one is a renewal. A paid invoice
 * without a PaymentIntent (credit-covered, zero amount) has nothing to record.
 */
export const recordInvoicePayment = async (
	container: CommerceContainer,
	invoice: ProviderInvoice,
	link: { subscriptionId: string; orderId: string | null },
): Promise<Payment | null> => {
	const paymentIntentId = invoice.paymentIntentId;
	if (!paymentIntentId) return null;
	const purpose: PaymentPurpose = isFirstInvoice(invoice) ? PAYMENT_PURPOSE.checkout : PAYMENT_PURPOSE.subscriptionRenewal;
	const provider = await container.provider();
	return upsertPaymentByIntent(
		container,
		paymentIntentId,
		async () => {
			const fresh = await provider.payments.retrievePayment(paymentIntentId);
			return fresh ? { payment: fresh, isFresh: true } : { payment: paymentFromInvoice(invoice, paymentIntentId), isFresh: false };
		},
		{ orderId: link.orderId, subscriptionId: link.subscriptionId, purpose, invoiceId: invoice.invoiceId },
	);
};

/**
 * `invoice.paid` / `invoice.payment_failed`. Event snapshots carry no payment links, so the invoice is
 * retrieved. The subscription record is ensured first because an invoice event can beat the subscription's
 * own events. A renewal becomes a payment record plus `invoice.paid`; a failure only emits an event
 * (the subscription status itself arrives as `customer.subscription.updated`).
 */
export const handleInvoice = async (
	{ container, publisher }: Deps,
	kind: "paid" | "failed",
	snapshot: ProviderInvoice,
): Promise<HandlerResult> => {
	const provider = await container.provider();
	const invoice = (await provider.subscriptions.retrieveInvoice(snapshot.invoiceId)) ?? snapshot;
	const providerSubscriptionId = invoice.subscriptionId ?? snapshot.subscriptionId;
	if (!providerSubscriptionId) return ignored("Invoice does not belong to a subscription");
	const subscription = await ensureSubscriptionRecord(container, providerSubscriptionId);
	if (!subscription) return ignored("Invoice belongs to a subscription this store did not create");

	if (kind === "failed") {
		await publisher.publish([
			makeEvent(container, "invoice.payment_failed", `${invoice.invoiceId}:${invoice.attemptCount}`, {
				subscriptionId: subscription.id,
				amount: invoice.amountDue,
				currency: invoice.currency,
				attemptCount: invoice.attemptCount,
			}),
		]);
		return HANDLED;
	}

	if (invoice.status !== "paid") return HANDLED;
	const orderId = isFirstInvoice(invoice)
		? (subscription.initialOrderId ?? ((await container.recordIndex.get(RECORD_INDEX_KEY.orderBySubscription(providerSubscriptionId))) || null))
		: null;
	const payment = await recordInvoicePayment(container, invoice, { subscriptionId: subscription.id, orderId });
	if (payment && !isFirstInvoice(invoice)) {
		await publisher.publish([
			makeEvent(container, "invoice.paid", invoice.invoiceId, {
				subscriptionId: subscription.id,
				paymentId: payment.id,
				amount: invoice.amountPaid,
				currency: invoice.currency,
			}),
		]);
	}
	return HANDLED;
};
