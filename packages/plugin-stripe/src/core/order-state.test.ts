import { describe, expect, it } from "vitest";

import { ORDER_EVENT, ORDER_PAYMENT_STATUS, type OrderEvent, type OrderPaymentStatus } from "./order.js";
import { transitionOrder } from "./order-state.js";

const S = ORDER_PAYMENT_STATUS;

const events: Record<string, OrderEvent> = {
	succeeded: { type: ORDER_EVENT.paymentSucceeded },
	failed: { type: ORDER_EVENT.paymentFailed },
	cancelled: { type: ORDER_EVENT.cancelled },
	refundNone: { type: ORDER_EVENT.refundUpdated, amountRefunded: 0, amountTotal: 1000 },
	refundPartial: { type: ORDER_EVENT.refundUpdated, amountRefunded: 400, amountTotal: 1000 },
	refundFull: { type: ORDER_EVENT.refundUpdated, amountRefunded: 1000, amountTotal: 1000 },
	refundOver: { type: ORDER_EVENT.refundUpdated, amountRefunded: 1200, amountTotal: 1000 },
	disputeOpened: { type: ORDER_EVENT.disputeOpened },
	disputeWon: { type: ORDER_EVENT.disputeWon },
	disputeLost: { type: ORDER_EVENT.disputeLost },
};

/** Expected next status for every (status, event) pair; anything absent must be ignored. */
const allowed: Partial<Record<OrderPaymentStatus, Record<string, OrderPaymentStatus>>> = {
	[S.pending]: { succeeded: S.paid, failed: S.failed, cancelled: S.cancelled },
	[S.failed]: { succeeded: S.paid },
	[S.paid]: {
		refundPartial: S.partiallyRefunded,
		refundFull: S.refunded,
		refundOver: S.refunded,
		disputeOpened: S.disputed,
	},
	[S.partiallyRefunded]: {
		refundPartial: S.partiallyRefunded,
		refundFull: S.refunded,
		refundOver: S.refunded,
		disputeOpened: S.disputed,
	},
	// disputeWon restores the stored status (covered separately).
	[S.disputed]: { disputeLost: S.disputeLost },
};

const pairs = Object.values(S).flatMap((status) =>
	Object.keys(events).map((eventName) => ({ status, eventName, next: allowed[status]?.[eventName] ?? null })),
);

describe("transitionOrder: every (status, event) pair", () => {
	it.each(pairs.filter((pair) => pair.status !== S.disputed || pair.eventName !== "disputeWon"))(
		"$status + $eventName -> $next",
		({ status, eventName, next }) => {
			const before = status === S.disputed ? S.paid : null;
			const result = transitionOrder(status, before, events[eventName]!);
			if (next === null) {
				expect(result).toEqual({ status, statusBeforeDispute: before, isChanged: false });
				return;
			}
			expect(result.status).toBe(next);
			const entersDispute = next === S.disputed;
			expect(result.statusBeforeDispute).toBe(entersDispute ? status : before);
			expect(result.isChanged).toBe(next !== status || result.statusBeforeDispute !== before);
		},
	);
});

describe("transitionOrder: disputes", () => {
	it("remembers the status before the dispute and restores it when won", () => {
		for (const origin of [S.paid, S.partiallyRefunded]) {
			const opened = transitionOrder(origin, null, events.disputeOpened!);
			expect(opened).toEqual({ status: S.disputed, statusBeforeDispute: origin, isChanged: true });
			const won = transitionOrder(opened.status, opened.statusBeforeDispute, events.disputeWon!);
			expect(won).toEqual({ status: origin, statusBeforeDispute: null, isChanged: true });
		}
	});

	it("falls back to paid when a won dispute has no stored status", () => {
		expect(transitionOrder(S.disputed, null, events.disputeWon!).status).toBe(S.paid);
	});

	it("keeps the stored status when the dispute is lost", () => {
		const lost = transitionOrder(S.disputed, S.partiallyRefunded, events.disputeLost!);
		expect(lost).toEqual({ status: S.disputeLost, statusBeforeDispute: S.partiallyRefunded, isChanged: true });
	});

	it("ignores refund updates while disputed", () => {
		expect(transitionOrder(S.disputed, S.paid, events.refundFull!).isChanged).toBe(false);
	});
});

describe("transitionOrder: refunds", () => {
	it("derives the status from cumulative amounts, so a replay is a no-op", () => {
		const first = transitionOrder(S.paid, null, events.refundPartial!);
		const replay = transitionOrder(first.status, first.statusBeforeDispute, events.refundPartial!);
		expect(first.status).toBe(S.partiallyRefunded);
		expect(replay).toEqual({ status: S.partiallyRefunded, statusBeforeDispute: null, isChanged: false });
	});

	it("treats a zero total with a refund as fully refunded", () => {
		const event: OrderEvent = { type: ORDER_EVENT.refundUpdated, amountRefunded: 1, amountTotal: 0 };
		expect(transitionOrder(S.paid, null, event).status).toBe(S.refunded);
	});

	it("does not leave a terminal refunded status", () => {
		expect(transitionOrder(S.refunded, null, events.refundPartial!).isChanged).toBe(false);
		expect(transitionOrder(S.refunded, null, events.succeeded!).isChanged).toBe(false);
	});

	it("a late payment failure cannot un-pay an order", () => {
		expect(transitionOrder(S.paid, null, events.failed!)).toEqual({ status: S.paid, statusBeforeDispute: null, isChanged: false });
	});
});
