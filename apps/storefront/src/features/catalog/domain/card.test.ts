import { describe, expect, it } from "vitest";

import type { ProductCardView } from "@emdash-commerce/plugin-stripe/contracts";
import { catalogCopy } from "../copy";
import { toCard } from "./card";

const sample: ProductCardView = {
	id: "1",
	slug: "demo",
	title: "Demo",
	excerpt: null,
	createdAt: new Date().toISOString(),
	images: [{ url: "https://example.com/a.jpg", alt: "A" }],
	brand: null,
	categories: [],
	price: { amount: 12_900, currency: "pln", isRange: false, priceId: "p1" },
	availability: { state: "in_stock", lowCount: null },
	sizes: [],
	hasVariants: false,
};

describe("toCard", () => {
	it("formats PLN price without compare-at", () => {
		const card = toCard(sample, { locale: "pl", copy: catalogCopy.pl, hrefOf: (slug) => `/shop/${slug}` });
		expect(card.price.label).toContain("129");
		expect(card.compareAtPrice).toBeUndefined();
	});
});
