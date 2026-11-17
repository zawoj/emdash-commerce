import { describe, expect, it } from "vitest";

import type { OrderView } from "@emdash-commerce/plugin-stripe/contracts";
import { ordersCopy } from "./copy";
import { orderPageOf } from "./view-model";

const view = (overrides: Partial<OrderView> = {}): OrderView => ({
	orderNumber: "ORD-2026-00042",
	status: "paid",
	orderStatus: "open",
	paymentStatus: "paid",
	fulfillmentStatus: "unfulfilled",
	placedAt: "2026-11-17T23:30:00.000Z",
	email: "buyer@example.com",
	customerName: "Ada",
	lines: [{ title: "Packet Windbreaker", variantTitle: "Packet Windbreaker — XL / Orange", quantity: 2, unitAmount: 5_900, amountTotal: 11_800 }],
	totals: { subtotal: 11_800, discount: 0, tax: 0, shipping: 0, total: 11_800, refunded: 0, currency: "usd" },
	hasSubscription: false,
	canOpenPortal: false,
	...overrides,
});

const stepStates = (props: ReturnType<typeof orderPageOf>): string[] => props.progress?.steps.map((step) => step.state) ?? [];

describe("orderPageOf", () => {
	it("shows the order number, the lines and the total the buyer paid", () => {
		const page = orderPageOf(view(), "en", ordersCopy.en);
		expect(page.confirmation.number).toBe("ORD-2026-00042");
		expect(page.summary.lines?.[0]).toMatchObject({ name: "Packet Windbreaker", variantText: "XL / Orange", quantityLabel: "× 2", price: "$118.00" });
		expect(page.summary.total).toEqual({ label: "Total", value: "$118.00" });
	});

	it("shows a line without a variant by its title alone", () => {
		const page = orderPageOf(view({ lines: [{ title: "Sticker Pack", variantTitle: null, quantity: 1, unitAmount: 500, amountTotal: 500 }] }), "en", ordersCopy.en);
		expect(page.summary.lines?.[0]?.variantText).toBeUndefined();
	});

	it("prints the placement day in UTC, not in the server's time zone", () => {
		const page = orderPageOf(view({ placedAt: "2026-11-17T23:30:00.000Z" }), "en", ordersCopy.en);
		expect(page.confirmation.facts?.find((fact) => fact.label === "Placed")?.value).toBe("November 17, 2026");
	});

	it("lists only the money rows that apply, with discounts and refunds as reductions", () => {
		const page = orderPageOf(
			view({ totals: { subtotal: 10_000, discount: 1_000, tax: 700, shipping: 500, total: 10_200, refunded: 200, currency: "usd" } }),
			"en",
			ordersCopy.en,
		);
		expect(page.summary.rows.map((row) => [row.label, row.value, row.kind])).toEqual([
			["Subtotal", "$100.00", undefined],
			["Discount", "-$10.00", "discount"],
			["Shipping", "$5.00", undefined],
			["Tax", "$7.00", "muted"],
			["Refunded", "-$2.00", "discount"],
		]);
		expect(orderPageOf(view(), "en", ordersCopy.en).summary.rows).toHaveLength(1);
	});

	it("tones the header by payment and drops the progress track when the order will not ship", () => {
		expect(orderPageOf(view({ paymentStatus: "pending" }), "en", ordersCopy.en).confirmation.tone).toBe("pending");
		const failed = orderPageOf(view({ paymentStatus: "failed" }), "en", ordersCopy.en);
		expect(failed.confirmation.tone).toBe("failed");
		expect(failed.progress).toBeNull();
		expect(orderPageOf(view({ paymentStatus: "cancelled" }), "en", ordersCopy.en).progress).toBeNull();
	});

	it("moves the current step from payment to shipping as the order advances", () => {
		expect(stepStates(orderPageOf(view({ paymentStatus: "pending" }), "en", ordersCopy.en))).toEqual(["done", "current", "upcoming"]);
		expect(stepStates(orderPageOf(view(), "en", ordersCopy.en))).toEqual(["done", "done", "current"]);
		expect(stepStates(orderPageOf(view({ fulfillmentStatus: "fulfilled" }), "en", ordersCopy.en))).toEqual(["done", "done", "done"]);
		expect(stepStates(orderPageOf(view({ paymentStatus: "refunded", fulfillmentStatus: "returned" }), "en", ordersCopy.en))).toEqual(["done", "done", "done"]);
	});

	it("shows a status a newer plugin adds as Unknown instead of failing", () => {
		const page = orderPageOf(view({ paymentStatus: "something_new" }), "en", ordersCopy.en);
		expect(page.confirmation.facts?.[0]?.value).toBe("Unknown");
	});

	it("speaks Polish with Polish money and dates", () => {
		const page = orderPageOf(view(), "pl", ordersCopy.pl);
		expect(page.confirmation.facts?.[0]?.value).toBe("Opłacone");
		expect(page.summary.total.value).toContain("118");
		expect(page.confirmation.facts?.[2]?.value).toContain("listopada");
	});
});
