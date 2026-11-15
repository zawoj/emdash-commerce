import { CART_STATUS } from "../../core/cart.js";
import { sellableKey, type SellableRef } from "../../core/catalog.js";
import { INVENTORY_ADJUSTMENT_REASON, RESERVATION_STATUS } from "../../core/inventory.js";
import { PAYMENT_STATUS } from "../../core/payment.js";
import { ORDER_EVENT, REVIEW_FLAG, type Order, type ReviewFlag } from "../../core/order.js";
import type { CommerceContainer } from "../../plugin/container.js";
import type { ProviderCheckoutSession, ProviderPayment } from "../../ports/payment-provider.js";
import { RECORD_INDEX_KEY } from "../../ports/repositories.js";
import { writeVariantStockMirror } from "../../adapters/emdash/content/catalog-mirror.js";
import { publishStockAlerts } from "../inventory.js";
import { ensureSubscriptionRecord } from "../subscriptions.js";
import { errorMessage } from "./async.js";
import { INDEX_KEY, makeEvent, type Deps } from "./deps.js";
import { recordInvoicePayment } from "./invoices.js";
import { addReviewFlags, applyOrderEvent, withOrderLock } from "./order-transitions.js";
import { upsertPaymentByIntent } from "./payment-records.js";

/**
 * The follow-up steps of settlement. Each one is safe to run twice and in any order relative to the others:
 * a retry after a crash simply runs them all again, and a step that already happened changes nothing.
 */

const paymentFromSession = (session: ProviderCheckoutSession, paymentIntentId: string): ProviderPayment => ({
	paymentIntentId,
	status: session.paymentStatus === "unpaid" ? PAYMENT_STATUS.processing : PAYMENT_STATUS.succeeded,
	amount: session.amountTotal,
	amountRefunded: 0,
	currency: session.currency,
	latestChargeId: null,
	methodType: null,
	failureCode: null,
	failureMessage: null,
	metadata: session.metadata,
});

/** One-time payment: the payment record of the session's PaymentIntent, linked to the order. */
export const recordCheckoutPayment = async ({ container }: Deps, order: Order, session: ProviderCheckoutSession): Promise<void> => {
	const paymentIntentId = session.paymentIntentId;
	if (!paymentIntentId) return;
	await container.recordIndex.set(RECORD_INDEX_KEY.orderByPaymentIntent(paymentIntentId), order.id);
	const provider = await container.provider();
	await upsertPaymentByIntent(
		container,
		paymentIntentId,
		async () => {
			const fresh = await provider.payments.retrievePayment(paymentIntentId);
			return fresh ? { payment: fresh, isFresh: true } : { payment: paymentFromSession(session, paymentIntentId), isFresh: false };
		},
		{ orderId: order.id },
	);
};

/** Subscription: the record (created from a fresh retrieve when no event beat us), indexes, and the first invoice's payment. */
export const recordCheckoutSubscription = async ({ container }: Deps, order: Order, session: ProviderCheckoutSession): Promise<void> => {
	const providerSubscriptionId = session.subscriptionId;
	if (!providerSubscriptionId) return;
	await container.recordIndex.set(RECORD_INDEX_KEY.orderBySubscription(providerSubscriptionId), order.id);
	const subscription = await ensureSubscriptionRecord(container, providerSubscriptionId, { initialOrderId: order.id, customerId: order.customerId });
	if (!subscription) return;
	if (order.subscriptionId !== subscription.id) {
		await withOrderLock(container, order.id, async () => {
			const current = await container.orders.get(order.id);
			if (current && current.subscriptionId === null) await container.orders.update(order.id, { subscriptionId: subscription.id });
		});
	}
	if (!session.invoiceId) return;
	const invoice = await (await container.provider()).subscriptions.retrieveInvoice(session.invoiceId);
	if (invoice && invoice.status === "paid") await recordInvoicePayment(container, invoice, { subscriptionId: subscription.id, orderId: order.id });
};

const sellablesOf = (reservationLines: ReadonlyArray<{ sellable: SellableRef }>): SellableRef[] => {
	const unique = new Map<string, SellableRef>();
	for (const line of reservationLines) unique.set(sellableKey(line.sellable), line.sellable);
	return [...unique.values()];
};

const mirrorVariantStock = async (container: CommerceContainer, sellables: readonly SellableRef[]): Promise<void> => {
	for (const sellable of sellables) {
		if (sellable.kind !== "variant") continue;
		try {
			const level = await container.inventory.get(sellable);
			if (level) await writeVariantStockMirror(container, sellable.id, level.onHand);
		} catch (error) {
			// The editor-facing field is a mirror; the authoritative count is in storage.
			container.log.warn("Variant stock mirror could not be written", { variantId: sellable.id, error: errorMessage(error) });
		}
	}
};

/**
 * Paid: turn the held reservation into a sale. `commit` is idempotent. When the reservation was already
 * released (an async payment that outlived the session's hold) the stock is decremented directly, once, and
 * an order that drives stock negative is flagged: the customer paid for something we may not have.
 */
export const commitOrderStock = async (deps: Deps, order: Order, reservationId: string | null): Promise<void> => {
	const { container, publisher } = deps;
	if (!reservationId) return;
	const reservation = await container.inventory.commit(reservationId);
	if (!reservation) return;
	const sellables = sellablesOf(reservation.lines);
	if (reservation.status === RESERVATION_STATUS.released) {
		const claim = await container.recordIndex.claim(INDEX_KEY.stockAdjusted(order.id));
		if (claim.isWinner) {
			let isOversold = false;
			for (const line of reservation.lines) {
				if (!(await container.inventory.get(line.sellable))) continue; // untracked: nothing to decrement
				const level = await container.inventory.adjust(line.sellable, -line.quantity, INVENTORY_ADJUSTMENT_REASON.sale);
				if (level.available < 0) isOversold = true;
			}
			await container.recordIndex.set(INDEX_KEY.stockAdjusted(order.id), order.id);
			if (isOversold) await flagOrder(deps, order, [REVIEW_FLAG.inventoryShortfall]);
		}
	}
	await publishStockAlerts(container, publisher, sellables);
	await mirrorVariantStock(container, sellables);
};

/** Adds review flags and announces them (the event id carries the flag set, so each new set is announced once). */
export const flagOrder = async ({ container, publisher }: Deps, order: Order, flags: readonly ReviewFlag[]): Promise<void> => {
	const { order: updated, added } = await addReviewFlags(container, order.id, flags);
	if (added.length === 0) return;
	await publishNeedsReview({ container, publisher }, updated);
};

export const publishNeedsReview = async ({ container, publisher }: Deps, order: Order): Promise<void> => {
	if (order.reviewFlags.length === 0) return;
	await publisher.publish([
		makeEvent(container, "order.needs_review", `${order.id}:${[...order.reviewFlags].sort().join(",")}`, {
			orderId: order.id,
			orderNumber: order.orderNumber,
			flags: order.reviewFlags,
		}),
	]);
};

/** Cart → `converted` with the order id (compare-and-set), then the admin mirror, best effort. */
export const convertCart = async ({ container }: Deps, order: Order, session: ProviderCheckoutSession): Promise<boolean> => {
	const cartId = order.cartId;
	if (!cartId) return false;
	for (let attempt = 0; attempt < 8; attempt += 1) {
		const loaded = await container.carts.get(cartId);
		if (!loaded) return false;
		const { value: cart } = loaded;
		if (cart.status === CART_STATUS.converted) return cart.orderId === order.id;
		// A cart that has moved on to another session is not the one this payment was for.
		if (cart.checkout?.sessionId && cart.checkout.sessionId !== session.sessionId) return false;
		const next = { ...cart, status: CART_STATUS.converted, orderId: order.id, updatedAt: container.clock.now().toISOString() };
		if (!(await container.carts.put(next, loaded.revision)).applied) continue;
		try {
			await container.cartMirror.upsert(next, {
				itemCount: next.lines.reduce((sum, line) => sum + line.quantity, 0),
				subtotal: session.amountSubtotal,
				currency: session.currency,
				lines: [],
			});
		} catch (error) {
			container.log.warn("Cart mirror could not be updated", { cartId, error: errorMessage(error) });
		}
		return true;
	}
	return false;
};

/** Marks the paid transition (pending or failed → paid) for an order whose session says the money arrived. */
export const markOrderPaid = (container: CommerceContainer, orderId: string) =>
	applyOrderEvent(container, orderId, { type: ORDER_EVENT.paymentSucceeded });
