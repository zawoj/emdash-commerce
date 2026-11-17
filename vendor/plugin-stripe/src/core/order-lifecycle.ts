import { FULFILLMENT_STATUS, ORDER_LIFECYCLE_STATUS, ORDER_PAYMENT_STATUS, type FulfillmentStatus, type Order, type OrderLifecycleStatus } from "./order.js";

/**
 * Guards of the lifecycle axis (open, completed, cancelled, archived) and of the fulfillment axis. Pure: the admin
 * services ask `planOrderAction` / `planFulfillmentChange` and persist the answer under the order lock.
 *
 * open       -> completed   paid (or partially refunded) AND fulfilled
 * open       -> cancelled   only while no money is held: a paid, partially refunded or disputed order is refunded first
 * completed | cancelled -> archived
 * completed | cancelled | archived -> open (reopen)
 */

export const ORDER_ACTION = {
	complete: "complete",
	cancel: "cancel",
	archive: "archive",
	reopen: "reopen",
} as const;
export type OrderAction = (typeof ORDER_ACTION)[keyof typeof ORDER_ACTION];

export type OrderActionPlan = { isAllowed: true; next: OrderLifecycleStatus } | { isAllowed: false; reason: string };
export type FulfillmentPlan = { isAllowed: true; next: FulfillmentStatus } | { isAllowed: false; reason: string };

type LifecycleInput = Pick<Order, "orderStatus" | "paymentStatus" | "fulfillmentStatus">;

const isMoneyCollected = (order: LifecycleInput): boolean =>
	order.paymentStatus === ORDER_PAYMENT_STATUS.paid || order.paymentStatus === ORDER_PAYMENT_STATUS.partiallyRefunded;

const isMoneyHeld = (order: LifecycleInput): boolean => isMoneyCollected(order) || order.paymentStatus === ORDER_PAYMENT_STATUS.disputed;

const planComplete = (order: LifecycleInput): OrderActionPlan => {
	if (order.orderStatus !== ORDER_LIFECYCLE_STATUS.open) return { isAllowed: false, reason: `Only an open order can be completed (this one is ${order.orderStatus})` };
	if (!isMoneyCollected(order)) return { isAllowed: false, reason: `The order is not paid (payment status: ${order.paymentStatus})` };
	if (order.fulfillmentStatus !== FULFILLMENT_STATUS.fulfilled) return { isAllowed: false, reason: `The order is not fulfilled (fulfillment: ${order.fulfillmentStatus})` };
	return { isAllowed: true, next: ORDER_LIFECYCLE_STATUS.completed };
};

const planCancel = (order: LifecycleInput): OrderActionPlan => {
	if (order.orderStatus !== ORDER_LIFECYCLE_STATUS.open) return { isAllowed: false, reason: `Only an open order can be cancelled (this one is ${order.orderStatus})` };
	if (isMoneyHeld(order)) return { isAllowed: false, reason: `The order holds money (payment status: ${order.paymentStatus}); refund it first` };
	return { isAllowed: true, next: ORDER_LIFECYCLE_STATUS.cancelled };
};

const planArchive = (order: LifecycleInput): OrderActionPlan => {
	const isFinished = order.orderStatus === ORDER_LIFECYCLE_STATUS.completed || order.orderStatus === ORDER_LIFECYCLE_STATUS.cancelled;
	if (!isFinished) return { isAllowed: false, reason: `Only a completed or cancelled order can be archived (this one is ${order.orderStatus})` };
	return { isAllowed: true, next: ORDER_LIFECYCLE_STATUS.archived };
};

const planReopen = (order: LifecycleInput): OrderActionPlan => {
	if (order.orderStatus === ORDER_LIFECYCLE_STATUS.open) return { isAllowed: false, reason: "The order is already open" };
	return { isAllowed: true, next: ORDER_LIFECYCLE_STATUS.open };
};

export const planOrderAction = (order: LifecycleInput, action: OrderAction): OrderActionPlan => {
	switch (action) {
		case ORDER_ACTION.complete:
			return planComplete(order);
		case ORDER_ACTION.cancel:
			return planCancel(order);
		case ORDER_ACTION.archive:
			return planArchive(order);
		case ORDER_ACTION.reopen:
			return planReopen(order);
	}
};

const isShipped = (status: FulfillmentStatus): boolean => status === FULFILLMENT_STATUS.fulfilled || status === FULFILLMENT_STATUS.partiallyFulfilled;

/** An archived order is frozen and a cancelled one cannot be shipped; everything else may move along the axis. */
export const planFulfillmentChange = (order: LifecycleInput, next: FulfillmentStatus): FulfillmentPlan => {
	if (order.orderStatus === ORDER_LIFECYCLE_STATUS.archived) return { isAllowed: false, reason: "An archived order cannot change; reopen it first" };
	if (order.orderStatus === ORDER_LIFECYCLE_STATUS.cancelled && isShipped(next)) return { isAllowed: false, reason: "A cancelled order cannot be fulfilled" };
	return { isAllowed: true, next };
};
