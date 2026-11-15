import { ORDER_EVENT, ORDER_PAYMENT_STATUS, type OrderEvent, type OrderPaymentStatus, type OrderTransitionResult } from "./order.js";

/**
 * The single place that decides an order's next payment status (see the transition table in `order.ts`).
 * Pure and total: an event that is not allowed from the current status returns the input unchanged
 * with `isChanged: false`, so replayed, late or out-of-order provider events converge on one state.
 */

const unchanged = (current: OrderPaymentStatus, statusBeforeDispute: OrderPaymentStatus | null): OrderTransitionResult => ({
	status: current,
	statusBeforeDispute,
	isChanged: false,
});

const moved = (
	current: OrderPaymentStatus,
	statusBeforeDispute: OrderPaymentStatus | null,
	next: OrderPaymentStatus,
	nextBeforeDispute: OrderPaymentStatus | null = statusBeforeDispute,
): OrderTransitionResult => ({
	status: next,
	statusBeforeDispute: nextBeforeDispute,
	isChanged: next !== current || nextBeforeDispute !== statusBeforeDispute,
});

const isRefundable = (status: OrderPaymentStatus): boolean =>
	status === ORDER_PAYMENT_STATUS.paid || status === ORDER_PAYMENT_STATUS.partiallyRefunded;

/** Derived from cumulative amounts; null when nothing is refunded (event carries no information). */
const refundTarget = (amountRefunded: number, amountTotal: number): OrderPaymentStatus | null => {
	if (!(amountRefunded > 0)) return null;
	return amountRefunded >= amountTotal ? ORDER_PAYMENT_STATUS.refunded : ORDER_PAYMENT_STATUS.partiallyRefunded;
};

const fromPending = (event: OrderEvent): OrderPaymentStatus | null => {
	switch (event.type) {
		case ORDER_EVENT.paymentSucceeded:
			return ORDER_PAYMENT_STATUS.paid;
		case ORDER_EVENT.paymentFailed:
			return ORDER_PAYMENT_STATUS.failed;
		case ORDER_EVENT.cancelled:
			return ORDER_PAYMENT_STATUS.cancelled;
		default:
			return null;
	}
};

export const transitionOrder = (
	current: OrderPaymentStatus,
	statusBeforeDispute: OrderPaymentStatus | null,
	event: OrderEvent,
): OrderTransitionResult => {
	switch (current) {
		case ORDER_PAYMENT_STATUS.pending: {
			const next = fromPending(event);
			return next ? moved(current, statusBeforeDispute, next) : unchanged(current, statusBeforeDispute);
		}
		case ORDER_PAYMENT_STATUS.failed:
			return event.type === ORDER_EVENT.paymentSucceeded
				? moved(current, statusBeforeDispute, ORDER_PAYMENT_STATUS.paid)
				: unchanged(current, statusBeforeDispute);
		case ORDER_PAYMENT_STATUS.paid:
		case ORDER_PAYMENT_STATUS.partiallyRefunded: {
			if (event.type === ORDER_EVENT.disputeOpened && isRefundable(current)) {
				return moved(current, statusBeforeDispute, ORDER_PAYMENT_STATUS.disputed, current);
			}
			if (event.type === ORDER_EVENT.refundUpdated) {
				const target = refundTarget(event.amountRefunded, event.amountTotal);
				return target ? moved(current, statusBeforeDispute, target) : unchanged(current, statusBeforeDispute);
			}
			return unchanged(current, statusBeforeDispute);
		}
		case ORDER_PAYMENT_STATUS.disputed: {
			if (event.type === ORDER_EVENT.disputeWon) {
				// A dispute opened by a legacy record may lack the stored status; paid is the only status
				// from which a dispute can be opened without a refund in progress.
				return moved(current, statusBeforeDispute, statusBeforeDispute ?? ORDER_PAYMENT_STATUS.paid, null);
			}
			if (event.type === ORDER_EVENT.disputeLost) return moved(current, statusBeforeDispute, ORDER_PAYMENT_STATUS.disputeLost);
			return unchanged(current, statusBeforeDispute);
		}
		case ORDER_PAYMENT_STATUS.refunded:
		case ORDER_PAYMENT_STATUS.disputeLost:
		case ORDER_PAYMENT_STATUS.cancelled:
			return unchanged(current, statusBeforeDispute);
	}
};
