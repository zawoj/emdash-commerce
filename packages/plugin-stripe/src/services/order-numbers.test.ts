import { describe, expect, it, vi } from "vitest";

import { commerceOptionsSchema } from "../contracts/options.js";
import { allOrders, completeCheckout, createHarness, seedCheckout } from "./payments/test-support.js";

/** `ORD-{YYYY}-{seq:5}` from a compare-and-set counter per year; `orders.numberFormat` reshapes it; the extension still wins. */

const settle = async (h: ReturnType<typeof createHarness>) => {
	const seeded = await seedCheckout(h);
	await h.deliver(completeCheckout(h, seeded));
	return (await h.container.orders.findByCheckoutSession(seeded.sessionId))!;
};

describe("sequential order numbers", () => {
	it("numbers orders ORD-YYYY-00001, 00002, ... in settlement order", async () => {
		const h = createHarness();
		const numbers = [];
		for (let index = 0; index < 3; index += 1) numbers.push((await settle(h)).orderNumber);
		expect(numbers).toEqual(["ORD-2026-00001", "ORD-2026-00002", "ORD-2026-00003"]);
	});

	it("never hands the same number to concurrent settlements", async () => {
		const h = createHarness();
		const seeds = await Promise.all(Array.from({ length: 12 }, () => seedCheckout(h)));
		await Promise.all(seeds.map((seeded) => h.deliver(completeCheckout(h, seeded))));
		const numbers = (await allOrders(h)).map((order) => order.orderNumber);
		expect(numbers).toHaveLength(12);
		expect(new Set(numbers).size).toBe(12);
		expect([...numbers].sort()).toEqual(Array.from({ length: 12 }, (_, index) => `ORD-2026-${String(index + 1).padStart(5, "0")}`));
	});

	it("hands out distinct sequence values to concurrent callers of the counter itself", async () => {
		const h = createHarness();
		const values = await Promise.all(Array.from({ length: 25 }, () => h.container.orders.nextSequence(2026)));
		expect(new Set(values).size).toBe(25);
		expect(Math.max(...values)).toBe(25);
	});

	it("restarts the sequence in a new year", async () => {
		const h = createHarness();
		await settle(h);
		h.world.clock.set("2027-01-02T10:00:00.000Z");
		expect((await settle(h)).orderNumber).toBe("ORD-2027-00001");
		expect((await settle(h)).orderNumber).toBe("ORD-2027-00002");
	});

	it("follows orders.numberFormat and numberPrefix", async () => {
		const h = createHarness({ options: { orders: { numberPrefix: "shop", numberFormat: "{PREFIX}/{YYYY}/{seq:3}" } } });
		expect((await settle(h)).orderNumber).toBe("SHOP/2026/001");
	});

	it("lets the generateOrderNumber extension win without consuming the counter", async () => {
		const h = createHarness({ extensions: { generateOrderNumber: () => "CUSTOM-1" } });
		const nextSequence = vi.spyOn(h.container.orders, "nextSequence");
		expect((await settle(h)).orderNumber).toBe("CUSTOM-1");
		expect(nextSequence).not.toHaveBeenCalled();
	});

	it("claims every number in the record index, so an extension cannot repeat one either", async () => {
		const h = createHarness({ extensions: { generateOrderNumber: () => "SAME" } });
		await settle(h);
		const second = await seedCheckout(h);
		const result = await h.deliver(completeCheckout(h, second));
		expect(result).toMatchObject({ outcome: "failed", error: expect.stringContaining("unique order number") });
	});
});

describe("orders.numberFormat option", () => {
	it("accepts the default and a custom format, and rejects an unusable one", () => {
		expect(commerceOptionsSchema.parse({}).orders.numberFormat).toBe("{PREFIX}-{YYYY}-{seq:5}");
		expect(commerceOptionsSchema.parse({ orders: { numberFormat: "{YYYY}{seq:6}" } }).orders.numberFormat).toBe("{YYYY}{seq:6}");
		expect(() => commerceOptionsSchema.parse({ orders: { numberFormat: "{YYYY}" } })).toThrow(/exactly one \{seq:N\}/);
		expect(() => commerceOptionsSchema.parse({ orders: { numberFormat: "{seq:5}-{MM}" } })).toThrow(/Unknown token/);
	});
});
