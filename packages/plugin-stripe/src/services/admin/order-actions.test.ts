import { describe, expect, it } from "vitest";

import type { AnyCommerceEvent } from "../../core/events.js";
import { listOrderEvents } from "../order-events.js";
import { completeCheckout, createHarness, event, paidOrder, seedCheckout, type Harness } from "../payments/test-support.js";
import type { AdminContext } from "./context.js";
import { addOrderNote, performOrderAction, setFulfillment } from "./order-actions.js";

const caller = { id: "u1", email: "boss@example.com" };

const adminOf = (h: Harness): { admin: AdminContext; published: AnyCommerceEvent[] } => {
	const published: AnyCommerceEvent[] = [];
	return { admin: { container: h.container, publisher: { publish: async (events) => void published.push(...events), processDue: async () => 0, retry: async () => undefined } }, published };
};
const timeline = async (h: Harness, orderId: string) => (await listOrderEvents(h.container, orderId, { cursor: null, limit: 100 })).items;
const reload = async (h: Harness, orderId: string) => (await h.container.orders.get(orderId))!;
const act = (h: Harness, orderId: string, action: "complete" | "cancel" | "archive" | "reopen") => performOrderAction(adminOf(h).admin, { orderId, action }, caller);

describe("lifecycle actions", () => {
	it("refuses to complete an unfulfilled order with the reason, and completes it once fulfilled", async () => {
		const h = createHarness();
		const { order } = await paidOrder(h);
		await expect(act(h, order.id, "complete")).rejects.toMatchObject({ kind: "conflict", message: expect.stringContaining("not fulfilled") });
		expect((await reload(h, order.id)).orderStatus).toBe("open");
		await setFulfillment(adminOf(h).admin, { orderId: order.id, fulfillmentStatus: "fulfilled" }, caller);
		const { admin, published } = adminOf(h);
		const summary = await performOrderAction(admin, { orderId: order.id, action: "complete" }, caller);
		expect(summary).toMatchObject({ orderStatus: "completed", paymentStatus: "paid", fulfillmentStatus: "fulfilled" });
		expect(published).toEqual([expect.objectContaining({ type: "order.completed", data: { orderId: order.id, orderNumber: order.orderNumber } })]);
		const change = (await timeline(h, order.id)).find((entry) => entry.type === "order_status_changed")!;
		expect(change).toMatchObject({ actorKind: "admin", actorLabel: "boss@example.com (u1)", data: { from: "open", to: "completed", action: "complete" } });
	});

	it("keeps the payment axis exactly as the provider left it", async () => {
		const h = createHarness();
		const { order } = await paidOrder(h);
		await setFulfillment(adminOf(h).admin, { orderId: order.id, fulfillmentStatus: "fulfilled" }, caller);
		await act(h, order.id, "complete");
		await act(h, order.id, "archive");
		const after = await reload(h, order.id);
		expect(after).toMatchObject({ orderStatus: "archived", paymentStatus: "paid", paidAt: order.paidAt, totals: order.totals });
	});

	it("refuses to cancel an order that holds money, and cancels one that does not", async () => {
		const h = createHarness();
		const { order } = await paidOrder(h);
		await expect(act(h, order.id, "cancel")).rejects.toMatchObject({ kind: "conflict", message: expect.stringContaining("refund it first") });

		const pendingSeed = await seedCheckout(h);
		await h.deliver(completeCheckout(h, pendingSeed, { paymentStatus: "unpaid" }));
		const pending = (await h.container.orders.findByCheckoutSession(pendingSeed.sessionId))!;
		const { admin, published } = adminOf(h);
		expect(await performOrderAction(admin, { orderId: pending.id, action: "cancel" }, caller)).toMatchObject({ orderStatus: "cancelled", paymentStatus: "pending" });
		expect(published).toEqual([expect.objectContaining({ type: "order.cancelled" })]);
	});

	it("archives a finished order and reopens it, announcing the previous status", async () => {
		const h = createHarness();
		const seeded = await seedCheckout(h);
		await h.deliver(completeCheckout(h, seeded, { paymentStatus: "unpaid" }));
		const order = (await h.container.orders.findByCheckoutSession(seeded.sessionId))!;
		await expect(act(h, order.id, "archive")).rejects.toMatchObject({ kind: "conflict" });
		await act(h, order.id, "cancel");
		await act(h, order.id, "archive");
		expect((await reload(h, order.id)).orderStatus).toBe("archived");
		const { admin, published } = adminOf(h);
		expect(await performOrderAction(admin, { orderId: order.id, action: "reopen" }, caller)).toMatchObject({ orderStatus: "open" });
		expect(published).toEqual([expect.objectContaining({ type: "order.reopened", data: expect.objectContaining({ previousStatus: "archived" }) })]);
		await expect(act(h, order.id, "reopen")).rejects.toMatchObject({ message: "The order is already open" });
	});

	it("reports a missing order as not found", async () => {
		const h = createHarness();
		await expect(act(h, "nope", "complete")).rejects.toMatchObject({ kind: "notFound" });
		await expect(setFulfillment(adminOf(h).admin, { orderId: "nope", fulfillmentStatus: "fulfilled" }, caller)).rejects.toMatchObject({ kind: "notFound" });
	});

	it("does not touch a refund or dispute that lands on the same order (the action runs inside the order lock)", async () => {
		const h = createHarness();
		const { order, seeded } = await paidOrder(h);
		await setFulfillment(adminOf(h).admin, { orderId: order.id, fulfillmentStatus: "fulfilled" }, caller);
		await Promise.all([
			act(h, order.id, "complete"),
			h.deliver(event({ kind: "dispute_updated", dispute: { disputeId: "dp_race", chargeId: "ch_race", paymentIntentId: seeded.paymentIntentId, amount: 5000, currency: order.totals.currency, status: "open", reason: null } }, { type: "charge.dispute.created" })),
		]);
		expect(await reload(h, order.id)).toMatchObject({ orderStatus: "completed", paymentStatus: "disputed", statusBeforeDispute: "paid" });
	});
});

describe("fulfillment axis", () => {
	it("moves through the five values, recording and announcing each change", async () => {
		const h = createHarness();
		const { order } = await paidOrder(h);
		const { admin, published } = adminOf(h);
		for (const next of ["partially_fulfilled", "fulfilled", "partially_returned", "returned"] as const) {
			expect((await setFulfillment(admin, { orderId: order.id, fulfillmentStatus: next }, caller)).fulfillmentStatus).toBe(next);
		}
		expect(published.map((entry) => entry.type)).toEqual(Array(4).fill("order.fulfillment_changed"));
		expect(published[1]).toMatchObject({ data: { fulfillmentStatus: "fulfilled", previousStatus: "partially_fulfilled" } });
		const entries = (await timeline(h, order.id)).filter((entry) => entry.type === "fulfillment_status_changed");
		expect(entries).toHaveLength(4);
		expect(entries.map((entry) => entry.data).sort((a, b) => String(a!.to).localeCompare(String(b!.to)))).toEqual([
			{ from: "partially_fulfilled", to: "fulfilled" },
			{ from: "unfulfilled", to: "partially_fulfilled" },
			{ from: "fulfilled", to: "partially_returned" },
			{ from: "partially_returned", to: "returned" },
		]);
	});

	it("is a no-op for the current value: no timeline entry, no domain event", async () => {
		const h = createHarness();
		const { order } = await paidOrder(h);
		const { admin, published } = adminOf(h);
		const before = (await timeline(h, order.id)).length;
		expect((await setFulfillment(admin, { orderId: order.id, fulfillmentStatus: "unfulfilled" }, caller)).fulfillmentStatus).toBe("unfulfilled");
		expect(published).toEqual([]);
		expect(await timeline(h, order.id)).toHaveLength(before);
	});

	it("freezes an archived order and refuses to ship a cancelled one", async () => {
		const h = createHarness();
		const seeded = await seedCheckout(h);
		await h.deliver(completeCheckout(h, seeded, { paymentStatus: "unpaid" }));
		const order = (await h.container.orders.findByCheckoutSession(seeded.sessionId))!;
		await act(h, order.id, "cancel");
		await expect(setFulfillment(adminOf(h).admin, { orderId: order.id, fulfillmentStatus: "fulfilled" }, caller)).rejects.toMatchObject({ kind: "conflict", message: "A cancelled order cannot be fulfilled" });
		await act(h, order.id, "archive");
		await expect(setFulfillment(adminOf(h).admin, { orderId: order.id, fulfillmentStatus: "returned" }, caller)).rejects.toMatchObject({ kind: "conflict", message: expect.stringContaining("archived") });
		expect((await reload(h, order.id)).fulfillmentStatus).toBe("unfulfilled");
	});
});

describe("notes", () => {
	it("adds a note to the timeline each time, attributed to the caller", async () => {
		const h = createHarness();
		const { order } = await paidOrder(h);
		await addOrderNote(h.container, { orderId: order.id, note: "Call the customer" }, caller);
		await addOrderNote(h.container, { orderId: order.id, note: "Call the customer" }, caller);
		const notes = (await timeline(h, order.id)).filter((entry) => entry.type === "note");
		expect(notes).toHaveLength(2);
		expect(notes[0]).toMatchObject({ message: "Call the customer", actorKind: "admin", actorLabel: "boss@example.com (u1)" });
		await expect(addOrderNote(h.container, { orderId: "nope", note: "x" }, caller)).rejects.toMatchObject({ kind: "notFound" });
	});
});
