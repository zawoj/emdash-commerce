import { describe, expect, it, vi } from "vitest";

import { ORDER_ACTOR_KIND, ORDER_TIMELINE_TYPE } from "../core/order-timeline.js";
import { RECORD_INDEX_KEY } from "../ports/repositories.js";
import { listOrderEvents, orderEventSourceKey, recordOrderEvent, tryRecordOrderEvent } from "./order-events.js";
import { createHarness, paidOrder } from "./payments/test-support.js";

const input = (orderId: string, over: Record<string, unknown> = {}) => ({ orderId, type: ORDER_TIMELINE_TYPE.note, message: "Hello", source: "s1", ...over });
const timeline = async (h: ReturnType<typeof createHarness>, orderId: string) => (await listOrderEvents(h.container, orderId, { cursor: null, limit: 100 })).items;

describe("recordOrderEvent", () => {
	it("stores one entry per (order, type, source) and reports a repeat as not new", async () => {
		const h = createHarness();
		const first = await recordOrderEvent(h.container, input("o1"));
		const again = await recordOrderEvent(h.container, input("o1", { message: "changed" }));
		expect(first.isNew).toBe(true);
		expect(again).toEqual({ isNew: false, eventId: first.eventId });
		expect(await timeline(h, "o1")).toEqual([expect.objectContaining({ message: "Hello", sourceKey: orderEventSourceKey("o1", "note", "s1") })]);
		// A different source, type or order is a different entry.
		await recordOrderEvent(h.container, input("o1", { source: "s2" }));
		await recordOrderEvent(h.container, input("o1", { type: ORDER_TIMELINE_TYPE.placed }));
		await recordOrderEvent(h.container, input("o2"));
		expect(await timeline(h, "o1")).toHaveLength(3);
	});

	it("stores a single entry under concurrent recording of the same occurrence", async () => {
		const h = createHarness();
		const results = await Promise.all(Array.from({ length: 8 }, () => recordOrderEvent(h.container, input("o1"))));
		expect(results.filter((result) => result.isNew)).toHaveLength(1);
		expect(await timeline(h, "o1")).toHaveLength(1);
	});

	it("derives the key from the occurrence only, so a repeat with the same source keeps the first message", async () => {
		expect(orderEventSourceKey("o1", "placed")).toBe("o1:placed");
		expect(orderEventSourceKey("o1", "payment_status_changed", "paid>refunded")).toBe("o1:payment_status_changed:paid>refunded");
	});

	it("defaults the actor to the system, keeps the label and data, caps the message, and stamps the clock", async () => {
		const h = createHarness();
		await recordOrderEvent(h.container, input("o1", { actorKind: ORDER_ACTOR_KIND.admin, actorLabel: "a@b.c", data: { x: 1 }, message: "m".repeat(900), source: "s9" }));
		await recordOrderEvent(h.container, input("o1", { source: "s10" }));
		const events = await timeline(h, "o1");
		const custom = events.find((event) => event.sourceKey.endsWith(":s9"))!;
		const defaults = events.find((event) => event.sourceKey.endsWith(":s10"))!;
		expect(custom).toMatchObject({ actorKind: "admin", actorLabel: "a@b.c", data: { x: 1 }, occurredAt: h.world.clock.now().toISOString() });
		expect(custom.message).toHaveLength(500);
		expect(defaults).toMatchObject({ actorKind: "system", actorLabel: null, data: null });
	});

	it("releases the claim when writing fails, so a retry records the entry", async () => {
		const h = createHarness();
		const create = vi.spyOn(h.container.orders.events, "create").mockRejectedValueOnce(new Error("store down"));
		await expect(recordOrderEvent(h.container, input("o1"))).rejects.toThrow("store down");
		expect(await h.container.recordIndex.get(RECORD_INDEX_KEY.orderEventBySource(orderEventSourceKey("o1", "note", "s1")))).toBeNull();
		create.mockRestore();
		expect((await recordOrderEvent(h.container, input("o1"))).isNew).toBe(true);
		expect(await timeline(h, "o1")).toHaveLength(1);
	});

	it("tryRecordOrderEvent logs and swallows a failure", async () => {
		const h = createHarness();
		const warn = vi.spyOn(h.container.log, "warn");
		vi.spyOn(h.container.orders.events, "create").mockRejectedValueOnce(new Error("store down"));
		await expect(tryRecordOrderEvent(h.container, input("o1"))).resolves.toBeUndefined();
		expect(warn).toHaveBeenCalledWith("The order timeline entry could not be written", expect.objectContaining({ orderId: "o1", type: "note", error: "store down" }));
	});

	it("lists newest first and pages", async () => {
		const h = createHarness();
		const { order } = await paidOrder(h);
		h.world.clock.advance(1000);
		await recordOrderEvent(h.container, input(order.id, { message: "later" }));
		const page = await listOrderEvents(h.container, order.id, { cursor: null, limit: 1 });
		expect(page.items.map((item) => item.message)).toEqual(["later"]);
		expect(page.cursor).not.toBeNull();
		expect((await listOrderEvents(h.container, order.id, { cursor: page.cursor, limit: 10 })).items.length).toBeGreaterThan(0);
	});
});
