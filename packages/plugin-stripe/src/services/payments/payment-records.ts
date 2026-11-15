import { PAYMENT_PURPOSE, PAYMENT_STATUS, type Payment, type PaymentPurpose } from "../../core/payment.js";
import type { CommerceContainer } from "../../plugin/container.js";
import type { ProviderPayment } from "../../ports/payment-provider.js";
import { RECORD_INDEX_KEY } from "../../ports/repositories.js";
import { LOCK_KEY, withLock } from "../locks.js";
import { claimOrAwait } from "./deps.js";

/** What ties a payment record to the rest of the store; set once, never overwritten by a later event. */
export interface PaymentLink {
	orderId?: string | null;
	subscriptionId?: string | null;
	purpose?: PaymentPurpose;
	invoiceId?: string | null;
}

export interface LoadedPayment {
	payment: ProviderPayment;
	/** False for an event snapshot, which may be older than what we already stored. */
	isFresh: boolean;
}

const indexExtras = async (container: CommerceContainer, id: string, payment: ProviderPayment, link: PaymentLink): Promise<void> => {
	if (payment.latestChargeId) await container.recordIndex.set(RECORD_INDEX_KEY.paymentByCharge(payment.latestChargeId), id);
	if (link.invoiceId) await container.recordIndex.set(RECORD_INDEX_KEY.paymentByInvoice(link.invoiceId), id);
};

const mergePatch = (current: Payment, incoming: LoadedPayment, link: PaymentLink, nowIso: string): Partial<Omit<Payment, "id">> => {
	const { payment, isFresh } = incoming;
	// An event snapshot never un-pays a payment we already know succeeded (events can arrive out of order).
	const isStale = !isFresh && current.status === PAYMENT_STATUS.succeeded && payment.status !== PAYMENT_STATUS.succeeded;
	const patch: Partial<Omit<Payment, "id">> = { updatedAt: nowIso };
	if (!isStale) {
		patch.status = payment.status;
		patch.amount = payment.amount;
		patch.currency = payment.currency;
		patch.failureCode = payment.status === PAYMENT_STATUS.succeeded ? null : payment.failureCode;
		patch.failureMessage = payment.status === PAYMENT_STATUS.succeeded ? null : payment.failureMessage;
		if (payment.methodType) patch.methodType = payment.methodType;
		// Cumulative provider total (never a delta), so a replay cannot double count.
		patch.amountRefunded = payment.amountRefunded;
	}
	const stripe = { ...current.stripe };
	if (payment.latestChargeId) stripe.chargeId = payment.latestChargeId;
	if (link.invoiceId && stripe.invoiceId === null) stripe.invoiceId = link.invoiceId;
	patch.stripe = stripe;
	if (link.orderId && current.orderId === null) patch.orderId = link.orderId;
	if (link.subscriptionId && current.subscriptionId === null) patch.subscriptionId = link.subscriptionId;
	return patch;
};

/**
 * Creates or refreshes the payment record of one PaymentIntent. `load` runs inside the exactly-once claim
 * (first sight) or the payment's lock (later), so concurrent events are applied one after another, each
 * reading the provider's state at its own turn: the last write is always the newest state.
 */
export const upsertPaymentByIntent = async (
	container: CommerceContainer,
	paymentIntentId: string,
	load: () => Promise<LoadedPayment>,
	link: PaymentLink = {},
): Promise<Payment> => {
	const key = RECORD_INDEX_KEY.paymentByPaymentIntent(paymentIntentId);
	let paymentId = await container.recordIndex.get(key);
	if (!paymentId) {
		const claim = await claimOrAwait(container, key);
		if (claim.isWinner) {
			try {
				const { payment } = await load();
				const nowIso = container.clock.now().toISOString();
				const created = await container.payments.create({
					orderId: link.orderId ?? null,
					subscriptionId: link.subscriptionId ?? null,
					purpose: link.purpose ?? PAYMENT_PURPOSE.checkout,
					status: payment.status,
					amount: payment.amount,
					amountRefunded: payment.amountRefunded,
					currency: payment.currency,
					methodType: payment.methodType,
					failureCode: payment.failureCode,
					failureMessage: payment.failureMessage,
					stripe: { paymentIntentId, chargeId: payment.latestChargeId, invoiceId: link.invoiceId ?? null },
					createdAt: nowIso,
					updatedAt: nowIso,
				});
				await container.recordIndex.set(key, created.id);
				await indexExtras(container, created.id, payment, link);
				return created;
			} catch (error) {
				await container.recordIndex.releaseClaim(key);
				throw error;
			}
		}
		paymentId = claim.recordId;
	}
	const id = paymentId;
	return withLock(container, LOCK_KEY.payment(id), async () => {
		const current = await container.payments.get(id);
		if (!current) throw new Error(`Payment ${id} is indexed but missing`);
		const incoming = await load();
		const updated = await container.payments.update(id, mergePatch(current, incoming, link, container.clock.now().toISOString()));
		await indexExtras(container, id, incoming.payment, link);
		return updated;
	});
};
