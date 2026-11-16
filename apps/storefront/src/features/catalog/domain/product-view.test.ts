import { describe, expect, it } from "vitest";

import type { ProductDetailView } from "@emdash-commerce/plugin-stripe/contracts";

import { LOCALES } from "../../../lib/i18n";
import { catalogCopy } from "../copy";
import { buildProductView } from "./product-view";

const bundle = {
	id: "b1",
	slug: "desk-setup-bundle",
	title: "Desk Setup Bundle",
	excerpt: null,
	createdAt: "2026-11-01T00:00:00Z",
	images: [{ url: "/a.png", alt: "a" }],
	brand: null,
	categories: [],
	price: { amount: 10900, currency: "usd", isRange: false, priceId: "price_1" },
	availability: { state: "in_stock", lowCount: null },
	sizes: [],
	hasVariants: false,
	description: [{ _type: "block", children: [{ text: "$109 instead of $147 for the items bought apart." }] }],
	sku: "BND",
	axes: [],
	variants: [],
	specs: [
		{ label: "Includes", value: "Mat, Lamp" },
		{ label: "Material", value: "Steel" },
	],
	extraPrices: [],
	related: [],
} as unknown as ProductDetailView;

const build = (detail: ProductDetailView) =>
	buildProductView({
		detail,
		locale: LOCALES.en,
		copy: catalogCopy.en,
		shopHref: "/shop",
		homeHref: "/",
		now: new Date("2026-11-16T10:00:00Z"),
	});

describe("buildProductView buy column", () => {
	it("lists the bundle's parts and saving and keeps them out of the specification", () => {
		const model = build(bundle);
		expect(model.bundle).toEqual({ items: ["Mat", "Lamp"], saving: "$109 instead of $147" });
		expect(model.specRows).toEqual([{ label: "Material", value: "Steel" }]);
	});

	it("states a concrete delivery window as the first of three promises", () => {
		const { promises } = build(bundle);
		expect(promises).toHaveLength(3);
		expect(promises[0]?.text).toBe("Tracked delivery");
		expect(promises[0]?.detail).toBe("Arrives Thu, Nov 19 – Mon, Nov 23");
	});

	it("has no bundle for a product without an Includes row", () => {
		expect(build({ ...bundle, specs: [{ label: "Material", value: "Steel" }] }).bundle).toBeNull();
	});

	it("promises no delivery date for a sold-out product, and keeps the other promises", () => {
		const { promises } = build({ ...bundle, availability: { state: "sold_out", lowCount: null } } as ProductDetailView);
		expect(promises.map((promise) => promise.text)).toEqual(["30-day returns", "Secure card payment"]);
		expect(JSON.stringify(promises)).not.toMatch(/Arrives/);
	});
});
