import { describe, expect, it } from "vitest";

import { ORDER_ACTION, planFulfillmentChange, planOrderAction, type OrderAction } from "./order-lifecycle.js";
import { FULFILLMENT_STATUS, ORDER_LIFECYCLE_STATUS as L, ORDER_PAYMENT_STATUS as P, type FulfillmentStatus, type OrderLifecycleStatus, type OrderPaymentStatus } from "./order.js";

const order = (orderStatus: OrderLifecycleStatus, paymentStatus: OrderPaymentStatus, fulfillmentStatus: FulfillmentStatus) => ({ orderStatus, paymentStatus, fulfillmentStatus });
const F = FULFILLMENT_STATUS;

describe("planOrderAction", () => {
	it("completes only an open order that is paid and fulfilled", () => {
		expect(planOrderAction(order(L.open, P.paid, F.fulfilled), ORDER_ACTION.complete)).toEqual({ isAllowed: true, next: L.completed });
		expect(planOrderAction(order(L.open, P.partiallyRefunded, F.fulfilled), ORDER_ACTION.complete)).toEqual({ isAllowed: true, next: L.completed });
		for (const payment of [P.pending, P.failed, P.refunded, P.disputed, P.disputeLost, P.cancelled]) {
			expect(planOrderAction(order(L.open, payment, F.fulfilled), ORDER_ACTION.complete)).toMatchObject({ isAllowed: false, reason: expect.stringContaining("not paid") });
		}
		for (const fulfillment of [F.unfulfilled, F.partiallyFulfilled, F.partiallyReturned, F.returned]) {
			expect(planOrderAction(order(L.open, P.paid, fulfillment), ORDER_ACTION.complete)).toMatchObject({ isAllowed: false, reason: expect.stringContaining("not fulfilled") });
		}
		for (const lifecycle of [L.completed, L.cancelled, L.archived]) {
			expect(planOrderAction(order(lifecycle, P.paid, F.fulfilled), ORDER_ACTION.complete)).toMatchObject({ isAllowed: false, reason: expect.stringContaining("Only an open order") });
		}
	});

	it("cancels an open order only while it holds no money", () => {
		for (const payment of [P.pending, P.failed, P.refunded, P.disputeLost, P.cancelled]) {
			expect(planOrderAction(order(L.open, payment, F.unfulfilled), ORDER_ACTION.cancel)).toEqual({ isAllowed: true, next: L.cancelled });
		}
		for (const payment of [P.paid, P.partiallyRefunded, P.disputed]) {
			expect(planOrderAction(order(L.open, payment, F.unfulfilled), ORDER_ACTION.cancel)).toMatchObject({ isAllowed: false, reason: expect.stringContaining("refund it first") });
		}
		expect(planOrderAction(order(L.completed, P.pending, F.unfulfilled), ORDER_ACTION.cancel)).toMatchObject({ isAllowed: false });
	});

	it("archives only a completed or cancelled order", () => {
		expect(planOrderAction(order(L.completed, P.paid, F.fulfilled), ORDER_ACTION.archive)).toEqual({ isAllowed: true, next: L.archived });
		expect(planOrderAction(order(L.cancelled, P.pending, F.unfulfilled), ORDER_ACTION.archive)).toEqual({ isAllowed: true, next: L.archived });
		for (const lifecycle of [L.open, L.archived]) expect(planOrderAction(order(lifecycle, P.paid, F.fulfilled), ORDER_ACTION.archive)).toMatchObject({ isAllowed: false });
	});

	it("reopens any order that is not open", () => {
		for (const lifecycle of [L.completed, L.cancelled, L.archived]) {
			expect(planOrderAction(order(lifecycle, P.paid, F.fulfilled), ORDER_ACTION.reopen)).toEqual({ isAllowed: true, next: L.open });
		}
		expect(planOrderAction(order(L.open, P.paid, F.fulfilled), ORDER_ACTION.reopen)).toMatchObject({ isAllowed: false, reason: "The order is already open" });
	});

	it("answers every action for every lifecycle status (total function)", () => {
		for (const lifecycle of Object.values(L)) for (const action of Object.values(ORDER_ACTION) as OrderAction[]) {
			expect(typeof planOrderAction(order(lifecycle, P.paid, F.fulfilled), action).isAllowed).toBe("boolean");
		}
	});
});

describe("planFulfillmentChange", () => {
	it("moves freely on an open or completed order", () => {
		for (const next of Object.values(F)) {
			expect(planFulfillmentChange(order(L.open, P.paid, F.unfulfilled), next)).toEqual({ isAllowed: true, next });
			expect(planFulfillmentChange(order(L.completed, P.paid, F.fulfilled), next)).toEqual({ isAllowed: true, next });
		}
	});

	it("freezes an archived order and refuses to ship a cancelled one", () => {
		expect(planFulfillmentChange(order(L.archived, P.paid, F.fulfilled), F.returned)).toMatchObject({ isAllowed: false, reason: expect.stringContaining("archived") });
		for (const shipped of [F.fulfilled, F.partiallyFulfilled]) expect(planFulfillmentChange(order(L.cancelled, P.pending, F.unfulfilled), shipped)).toMatchObject({ isAllowed: false });
		expect(planFulfillmentChange(order(L.cancelled, P.paid, F.fulfilled), F.returned)).toEqual({ isAllowed: true, next: F.returned });
	});
});
