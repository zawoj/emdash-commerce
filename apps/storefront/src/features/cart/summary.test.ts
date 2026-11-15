import { describe, expect, it } from "vitest";

import type { CartView } from "@emdash-commerce/plugin-stripe/contracts";

import { lineContents, pickLineImage, productHrefForLine } from "./summary";

describe("productHrefForLine", () => {
	it("uses the catalog slug when known", () => {
		const slugs = new Map([["prod-1", "run-cap"]]);
		expect(productHrefForLine("prod-1", slugs)).toBe("/shop/run-cap");
	});

	it("falls back to the product id when the slug is missing", () => {
		expect(productHrefForLine("prod-1", new Map())).toBe("/shop/prod-1");
	});
});

describe("lineContents", () => {
	it("links cart lines by product slug", () => {
		const cart = {
			lines: [
				{
					priceId: "price-1",
					productId: "prod-abc",
					variantId: null,
					title: "Run Cap",
					variantTitle: null,
					quantity: 1,
					unitAmount: { amount: 8900, currency: "PLN" },
					lineTotal: { amount: 8900, currency: "PLN" },
					priceType: "one_time",
					interval: null,
					intervalCount: null,
					trialDays: null,
					available: null,
				},
			],
		} as CartView;
		const slugs = new Map([["prod-abc", "run-cap"]]);
		const lines = lineContents(cart, "en", slugs);
		expect(lines[0]?.name.href).toBe("/shop/run-cap");
	});
});

describe("pickLineImage", () => {
	const detail = {
		title: "Shell",
		images: [{ url: "/product.jpg", alt: "Shell front" }],
		variants: [
			{ id: "v-black", imageUrls: ["/black.jpg"] },
			{ id: "v-red", imageUrls: [] },
		],
	} as unknown as Parameters<typeof pickLineImage>[1];

	it("uses the variant's own photo", () => {
		expect(pickLineImage("v-black", detail, undefined)?.url).toBe("/black.jpg");
	});

	it("falls back to the product photo when the variant has none", () => {
		expect(pickLineImage("v-red", detail, undefined)?.url).toBe("/product.jpg");
	});

	it("falls back to the catalog card photo without a detail", () => {
		expect(pickLineImage(null, null, { url: "/card.jpg", alt: "Card" })?.url).toBe("/card.jpg");
	});

	it("returns nothing when the product has no photo at all", () => {
		expect(pickLineImage(null, null, undefined)).toBeUndefined();
	});
});
