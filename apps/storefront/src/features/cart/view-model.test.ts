import { describe, expect, it } from "vitest";
import type { CartView } from "@emdash-commerce/plugin-stripe/contracts";

import { cartCopy } from "./copy";
import { applyCartIssues, cartPageOf } from "./view-model";

const emptyCart: CartView = {
	cartId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
	isNew: false,
	status: "active",
	lines: [],
	itemCount: 0,
	subtotal: null,
	mode: null,
	issues: [],
	isCheckoutReady: false,
	expiresAt: new Date().toISOString(),
};

const lineCart: CartView = {
	...emptyCart,
	lines: [
		{
			priceId: "price_1",
			productId: "prod_1",
			variantId: null,
			title: "Hat",
			variantTitle: null,
			quantity: 2,
			unitAmount: { amount: 1000, currency: "usd" },
			lineTotal: { amount: 2000, currency: "usd" },
			priceType: "one_time",
			interval: null,
			intervalCount: null,
			trialDays: null,
			available: 10,
		},
	],
	itemCount: 2,
	subtotal: { amount: 2000, currency: "usd" },
	isCheckoutReady: true,
	issues: [{ code: "OUT_OF_STOCK", priceId: "price_1", message: "Sold out" }],
};

describe("cartPageOf", () => {
	it("marks an empty cart and exposes the subtotal test hook when lines exist", () => {
		const page = cartPageOf(lineCart, "en", cartCopy.en, new Map([["prod_1", "hat"]]), new Map());
		expect(page.isEmpty).toBe(false);
		expect(page.isCheckoutReady).toBe(true);
		expect(page.summary.rows[0]?.testId).toBe("cart-subtotal");
		expect(page.lines[0]?.isUnavailable).toBe(true);
	});

	it("joins cart-wide issues into the alert text", () => {
		const page = cartPageOf(
			{ ...lineCart, issues: [{ code: "MIXED_CURRENCY", priceId: null, message: "Mixed currency" }] },
			"en",
			cartCopy.en,
			new Map(),
			new Map(),
		);
		expect(page.alertText).toBe("Mixed currency");
	});
});

describe("applyCartIssues", () => {
	it("leaves lines without matching issues unchanged", () => {
		const lines = cartPageOf(emptyCart, "en", cartCopy.en, new Map(), new Map()).lines;
		expect(applyCartIssues(lines, emptyCart, cartCopy.en)).toEqual(lines);
	});

	it("gives an issue line one warning: the reason in unavailableText, no second notice with the same text", () => {
		const [line] = cartPageOf(lineCart, "en", cartCopy.en, new Map([["prod_1", "hat"]]), new Map()).lines;
		expect(line?.unavailableText).toBe("Sold out");
		expect(line?.unavailableLabel).toBe("Warning");
		expect(line?.notice).toBeUndefined();
	});
});
