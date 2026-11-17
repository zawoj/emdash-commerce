import { CART_STATUS } from "../core/cart.js";
import { ORDER_EVENT, ORDER_PAYMENT_STATUS, type Order } from "../core/order.js";
import { ORDER_ACTOR_KIND, ORDER_TIMELINE_TYPE } from "../core/order-timeline.js";
import type { CommerceContainer } from "../plugin/container.js";
import { PROVIDER_METADATA, type ProviderCheckoutSession } from "../ports/payment-provider.js";
import { RECORD_INDEX_KEY, type CheckoutSnapshot } from "../ports/repositories.js";
import { countOrderForCustomer } from "./customers.js";
import { tryRecordOrderEvent } from "./order-events.js";
import { claimOrAwait, HANDLED, ignored, INDEX_KEY, isCreatedByPlugin, keyLivemode, makeEvent, type Deps, type HandlerResult } from "./payments/deps.js";
import { applyOrderEvent, isPaidStatus } from "./payments/order-transitions.js";
import { createOrderForSession, findOrderBySession } from "./payments/settlement-order.js";
import {
	commitOrderStock,
	convertCart,
	markOrderPaid,
	publishNeedsReview,
	recordCheckoutPayment,
	recordCheckoutSubscription,
} from "./payments/settlement-steps.js";
import { reviewFlagsForSession } from "./payments/settlement-validate.js";

/**
 * Checkout settlement: turns a paid Checkout Session into an order. The session is always retrieved fresh
 * from the provider (the event only names it), validated against the server-side snapshot, and settled
 * exactly once (a claim on the session id). Everything after creation is an idempotent follow-up that a retry
 * repeats, so a crash at any point leaves an order that the next attempt finishes, never a second one.
 */

const loadSnapshot = async (container: CommerceContainer, session: ProviderCheckoutSession): Promise<CheckoutSnapshot | null> => {
	const checkoutId = session.metadata[PROVIDER_METADATA.checkoutId];
	const byId = checkoutId ? await container.snapshots.get(checkoutId) : null;
	return byId ?? (await container.snapshots.getBySession(session.sessionId));
};

const reservationIdOf = async (container: CommerceContainer, order: Order, snapshot: CheckoutSnapshot | null): Promise<string | null> => {
	if (snapshot?.reservationId) return snapshot.reservationId;
	const cart = order.cartId ? await container.carts.get(order.cartId) : null;
	return cart?.value.checkout?.reservationId ?? null;
};

const findOrCreateOrder = async (container: CommerceContainer, session: ProviderCheckoutSession, snapshot: CheckoutSnapshot | null): Promise<Order> => {
	const key = RECORD_INDEX_KEY.orderBySession(session.sessionId);
	let orderId = await container.recordIndex.get(key);
	if (!orderId) {
		const claim = await claimOrAwait(container, key);
		if (claim.isWinner) {
			try {
				const orphan = await findOrderBySession(container, session.sessionId);
				if (orphan) {
					await container.recordIndex.set(key, orphan.id);
					return orphan;
				}
				const flags = reviewFlagsForSession({ session, snapshot, expectedLivemode: await keyLivemode(container) });
				return await createOrderForSession(container, { session, snapshot, flags });
			} catch (error) {
				// Safe: if the order did get created, the next winner finds it by scanning recent orders.
				await container.recordIndex.releaseClaim(key);
				throw error;
			}
		}
		orderId = claim.recordId;
	}
	const order = await container.orders.get(orderId);
	if (!order) throw new Error(`Order ${orderId} is indexed for session ${session.sessionId} but missing`);
	return order;
};

/** Brings the order to the status the session proves: paid when the money arrived, failed when we saw it fail. */
const reconcileStatus = async (container: CommerceContainer, order: Order, session: ProviderCheckoutSession): Promise<Order> => {
	if (session.paymentStatus !== "unpaid") {
		return order.paymentStatus === ORDER_PAYMENT_STATUS.pending || order.paymentStatus === ORDER_PAYMENT_STATUS.failed ? (await markOrderPaid(container, order.id)).order : order;
	}
	if (order.paymentStatus !== ORDER_PAYMENT_STATUS.pending) return order;
	const hasFailed = Boolean(await container.recordIndex.get(INDEX_KEY.checkoutFailed(session.sessionId)));
	return hasFailed ? (await applyOrderEvent(container, order.id, { type: ORDER_EVENT.paymentFailed })).order : order;
};

const finishSettlement = async (deps: Deps, created: Order, session: ProviderCheckoutSession, snapshot: CheckoutSnapshot | null): Promise<void> => {
	const { container, publisher } = deps;
	// First in every pass: a crash after the order was created still gets its "placed" entry on the retry.
	await tryRecordOrderEvent(container, {
		orderId: created.id,
		type: ORDER_TIMELINE_TYPE.placed,
		message: `Order ${created.orderNumber} placed`,
		actorKind: ORDER_ACTOR_KIND.customer,
		data: { sessionId: session.sessionId, total: created.totals.total, currency: created.totals.currency, mode: created.mode },
	});
	await reconcileStatus(container, created, session);
	if (session.mode === "subscription") await recordCheckoutSubscription(deps, created, session);
	else await recordCheckoutPayment(deps, created, session);
	const order = (await container.orders.get(created.id)) ?? created;

	const reservationId = await reservationIdOf(container, order, snapshot);
	if (isPaidStatus(order.paymentStatus)) await commitOrderStock(deps, order, reservationId);
	else if (order.paymentStatus === ORDER_PAYMENT_STATUS.failed && reservationId) await container.inventory.release(reservationId);

	const isCartConverted = await convertCart(deps, order, session);
	if (isPaidStatus(order.paymentStatus)) await countOrderForCustomer(container, order);

	// Re-published on every pass with deterministic ids: how a crash after the writes still emits the events.
	const events = [makeEvent(container, "order.created", order.id, { orderId: order.id, orderNumber: order.orderNumber, status: order.paymentStatus, paymentStatus: order.paymentStatus, orderStatus: order.orderStatus })];
	if (order.paidAt !== null) {
		events.push(makeEvent(container, "order.paid", order.id, { orderId: order.id, orderNumber: order.orderNumber, amount: order.totals.total, currency: order.totals.currency }));
	}
	if (order.paymentStatus === ORDER_PAYMENT_STATUS.failed) {
		events.push(makeEvent(container, "order.payment_failed", order.id, { orderId: order.id, orderNumber: order.orderNumber, failureCode: null }));
	}
	if (isCartConverted && order.cartId) events.push(makeEvent(container, "cart.converted", order.cartId, { cartId: order.cartId, orderId: order.id }));
	if (order.customerId) {
		const customer = await container.customers.get(order.customerId);
		if (customer) events.push(makeEvent(container, "customer.created", customer.id, { customerId: customer.id, email: customer.email }));
	}
	await publisher.publish(events);
	await publishNeedsReview(deps, order);
};

/** `checkout.session.completed` and `checkout.session.async_payment_succeeded`: both settle from fresh state. */
export const handleCheckoutSettled = async (deps: Deps, sessionId: string): Promise<HandlerResult> => {
	const { container } = deps;
	const session = await (await container.provider()).checkout.retrieveSession(sessionId);
	if (!session) throw new Error(`Checkout session ${sessionId} could not be retrieved`);
	if (!isCreatedByPlugin(session.metadata)) return ignored("Checkout session was not created by this store");
	if (session.status !== "complete") throw new Error(`Checkout session ${sessionId} is ${session.status}, not complete`);
	const snapshot = await loadSnapshot(container, session);
	const order = await findOrCreateOrder(container, session, snapshot);
	await finishSettlement(deps, order, session, snapshot);
	return HANDLED;
};

/**
 * `checkout.session.async_payment_failed`. The failure is remembered per session first (it can arrive before
 * the order exists; settlement then applies it), then the order fails and the held stock is released.
 */
export const handleCheckoutAsyncFailed = async ({ container, publisher }: Deps, sessionId: string): Promise<HandlerResult> => {
	const session = await (await container.provider()).checkout.retrieveSession(sessionId);
	if (!session) return ignored("Checkout session could not be retrieved");
	if (!isCreatedByPlugin(session.metadata)) return ignored("Checkout session was not created by this store");
	await container.recordIndex.set(INDEX_KEY.checkoutFailed(sessionId), sessionId);
	const snapshot = await loadSnapshot(container, session);
	const orderId = await container.recordIndex.get(RECORD_INDEX_KEY.orderBySession(sessionId));
	if (snapshot?.reservationId) await container.inventory.release(snapshot.reservationId);
	if (!orderId) return HANDLED;

	const change = await applyOrderEvent(container, orderId, { type: ORDER_EVENT.paymentFailed });
	if (change.order.paymentStatus !== ORDER_PAYMENT_STATUS.failed) return HANDLED;
	const payment = session.paymentIntentId ? await (await container.provider()).payments.retrievePayment(session.paymentIntentId) : null;
	await publisher.publish([
		makeEvent(container, "order.payment_failed", orderId, {
			orderId,
			orderNumber: change.order.orderNumber,
			failureCode: payment?.failureCode ?? null,
		}),
	]);
	return HANDLED;
};

/**
 * `checkout.session.expired`: nobody paid. Release the stock hold and, if the cart is still waiting on this
 * very session, open it again. An order that exists for the session owns the reservation, so nothing happens.
 */
export const handleCheckoutExpired = async ({ container }: Deps, sessionId: string): Promise<HandlerResult> => {
	const session = await (await container.provider()).checkout.retrieveSession(sessionId);
	if (!session) return ignored("Checkout session could not be retrieved");
	if (!isCreatedByPlugin(session.metadata)) return ignored("Checkout session was not created by this store");
	if (await container.recordIndex.get(RECORD_INDEX_KEY.orderBySession(sessionId))) return ignored("An order exists for this session");

	const snapshot = await loadSnapshot(container, session);
	const cartId = session.metadata[PROVIDER_METADATA.cartId] ?? snapshot?.cartId ?? null;
	const cart = cartId ? await container.carts.get(cartId) : null;
	const reservationId = snapshot?.reservationId ?? cart?.value.checkout?.reservationId ?? null;
	if (reservationId) await container.inventory.release(reservationId);

	for (let attempt = 0; cartId && attempt < 8; attempt += 1) {
		const loaded = await container.carts.get(cartId);
		if (!loaded) break;
		const { value } = loaded;
		if (value.status !== CART_STATUS.checkoutOpen || value.checkout?.sessionId !== sessionId) break;
		const next = { ...value, status: CART_STATUS.active, checkout: null, updatedAt: container.clock.now().toISOString() };
		if ((await container.carts.put(next, loaded.revision)).applied) break;
	}
	return HANDLED;
};
