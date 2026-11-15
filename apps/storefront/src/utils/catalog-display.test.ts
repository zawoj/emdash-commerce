import { describe, expect, it } from "vitest";
import type { CatalogProductView } from "@emdash-commerce/plugin-stripe/contracts";
import { SHOP_PRODUCT_TYPE, SHOP_SORT } from "./shop-archive-controls";
import {
	catalogMatchesProductType,
	defaultPriceAmount,
	sortCatalogCards,
	shopCatalogCardFromView,
} from "./catalog-display";

const catalog = (slug: string, amount: number, type: "one_time" | "recurring"): CatalogProductView => ({
	id: `prod_${slug}`,
	slug,
	title: slug,
	hasVariants: false,
	options: [],
	variants: [],
	prices: [
		{
			id: `price_${slug}`,
			variantId: null,
			nickname: null,
			type,
			unitAmount: { amount, currency: "pln" },
			interval: type === "recurring" ? "month" : null,
			intervalCount: null,
			trialDays: null,
			lookupKey: null,
			isDefault: true,
			isPurchasable: true,
		},
	],
	available: null,
	isAvailable: true,
});

describe("catalogMatchesProductType", () => {
	it("matches one-time and subscription default prices", () => {
		const oneTime = catalog("a", 1000, "one_time");
		const sub = catalog("b", 2000, "recurring");
		expect(catalogMatchesProductType(oneTime, SHOP_PRODUCT_TYPE.ONE_TIME)).toBe(true);
		expect(catalogMatchesProductType(oneTime, SHOP_PRODUCT_TYPE.SUBSCRIPTION)).toBe(false);
		expect(catalogMatchesProductType(sub, SHOP_PRODUCT_TYPE.SUBSCRIPTION)).toBe(true);
	});
});

describe("sortCatalogCards", () => {
	it("orders by default price amount", () => {
		const cards = [
			{ ...shopCatalogCardFromView(catalog("c", 3000, "one_time"))!, slug: "c" },
			{ ...shopCatalogCardFromView(catalog("a", 1000, "one_time"))!, slug: "a" },
			{ ...shopCatalogCardFromView(catalog("b", 2000, "one_time"))!, slug: "b" },
		];
		const asc = sortCatalogCards(cards, SHOP_SORT.PRICE_ASC).map((c) => c.slug);
		const desc = sortCatalogCards(cards, SHOP_SORT.PRICE_DESC).map((c) => c.slug);
		expect(asc).toEqual(["a", "b", "c"]);
		expect(desc).toEqual(["c", "b", "a"]);
	});
});

describe("defaultPriceAmount", () => {
	it("reads the default price minor units", () => {
		expect(defaultPriceAmount(catalog("z", 4999, "one_time"))).toBe(4999);
	});
});
