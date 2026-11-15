import { transitionOrder } from "../../core/order-state.js";
import { ORDER_ACTOR_KIND, ORDER_TIMELINE_TYPE } from "../../core/order-timeline.js";
import { ORDER_PAYMENT_STATUS, type Order, type OrderEvent, type OrderPaymentStatus, type ReviewFlag } from "../../core/order.js";
import type { CommerceContainer } from "../../plugin/container.js";
import { LOCK_KEY, withLock } from "../locks.js";
import { tryRecordOrderEvent } from "../order-events.js";

/**
 * Every provider-driven order mutation goes through here. The content `update` is last-writer-wins per column, so
 * each change runs under the order's lock and re-reads the row inside it; nothing outside this file writes an
 * order's payment status, totals or review flags (the lifecycle and fulfillment axes are the admin's, in
 * services/admin/order-actions.ts, under the same lock).
 */

export interface OrderChange {
	order: Order;
	statusBefore: OrderPaymentStatus;
	isChanged: boolean;
}

/** What identifies the provider event behind a transition, so its timeline entry is recorded once. */
export interface TransitionContext {
	/** The provider object the event is about (dispute id, refund id, session id); omitted when the pair of statuses is unique. */
	source?: string;
}

export class OrderNotFoundError extends Error {
	constructor(orderId: string) {
		super(`Order ${orderId} not found`);
		this.name = "OrderNotFoundError";
	}
}

export const withOrderLock = <T>(container: CommerceContainer, orderId: string, run: () => Promise<T>): Promise<T> =>
	withLock(container, LOCK_KEY.order(orderId), run);

/**
 * Runs `transitionOrder` for `event` on the freshly read order and persists the outcome plus whatever
 * `extra` returns (computed from the same fresh row, so e.g. a refunded total is never based on a stale read).
 * Must be called inside `withOrderLock`.
 */
export const transitionLocked = async (
	container: CommerceContainer,
	orderId: string,
	eventOrFactory: OrderEvent | ((order: Order) => OrderEvent),
	extra?: (order: Order) => Partial<Omit<Order, "id">>,
	context: TransitionContext = {},
): Promise<OrderChange> => {
	const order = await container.orders.get(orderId);
	if (!order) throw new OrderNotFoundError(orderId);
	const event = typeof eventOrFactory === "function" ? eventOrFactory(order) : eventOrFactory;
	const result = transitionOrder(order.paymentStatus, order.statusBeforeDispute, event);
	const patch: Partial<Omit<Order, "id">> = {};
	if (result.isChanged) {
		patch.paymentStatus = result.status;
		patch.statusBeforeDispute = result.statusBeforeDispute;
		if (result.status === ORDER_PAYMENT_STATUS.paid && order.paidAt === null) patch.paidAt = container.clock.now().toISOString();
	}
	Object.assign(patch, extra?.(order) ?? {});
	if (Object.keys(patch).length === 0) return { order, statusBefore: order.paymentStatus, isChanged: false };
	// Recorded before the write: a crash in between makes the retry record the same key (a no-op) and then apply,
	// so the timeline never misses a change; a change that never lands leaves at worst one entry the retry confirms.
	if (result.isChanged && result.status !== order.paymentStatus) {
		await tryRecordOrderEvent(container, {
			orderId,
			type: ORDER_TIMELINE_TYPE.paymentStatusChanged,
			message: `Payment status changed from ${order.paymentStatus} to ${result.status}`,
			actorKind: ORDER_ACTOR_KIND.provider,
			data: { from: order.paymentStatus, to: result.status },
			source: `${order.paymentStatus}>${result.status}${context.source ? `:${context.source}` : ""}`,
		});
	}
	const updated = await container.orders.update(orderId, patch);
	return { order: updated, statusBefore: order.paymentStatus, isChanged: result.isChanged };
};

export const applyOrderEvent = (
	container: CommerceContainer,
	orderId: string,
	event: OrderEvent | ((order: Order) => OrderEvent),
	extra?: (order: Order) => Partial<Omit<Order, "id">>,
	context?: TransitionContext,
): Promise<OrderChange> => withOrderLock(container, orderId, () => transitionLocked(container, orderId, event, extra, context));

/** Adds flags (never removes: a human clears them) and returns the flags that were new. */
export const addReviewFlags = (
	container: CommerceContainer,
	orderId: string,
	flags: readonly ReviewFlag[],
): Promise<{ order: Order; added: ReviewFlag[] }> =>
	withOrderLock(container, orderId, async () => {
		const order = await container.orders.get(orderId);
		if (!order) throw new OrderNotFoundError(orderId);
		const added = flags.filter((flag, index) => !order.reviewFlags.includes(flag) && flags.indexOf(flag) === index);
		if (added.length === 0) return { order, added };
		return { order: await container.orders.update(orderId, { reviewFlags: [...order.reviewFlags, ...added] }), added };
	});

export const isPaidStatus = (status: OrderPaymentStatus): boolean =>
	status === ORDER_PAYMENT_STATUS.paid || status === ORDER_PAYMENT_STATUS.partiallyRefunded || status === ORDER_PAYMENT_STATUS.refunded;
