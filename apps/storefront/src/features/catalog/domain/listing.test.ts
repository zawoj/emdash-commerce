import type { ProductCardView } from "@emdash-commerce/plugin-stripe/contracts";
import { describe, expect, it } from "vitest";

import { catalogCopy } from "../copy";
import { toFacet } from "./facets";
import {
	activeFiltersOf,
	brandsOf,
	categoriesOf,
	categoryBarProps,
	clearAllLink,
	countLabel,
	filtersProps,
	resultsLabel,
	startFromCategoryLinks,
	toolbarProps,
	withKnownCategory,
	type ListingContext,
} from "./listing";
import { parseListing } from "./params";

const item = (
	slug: string,
	overrides: Partial<{ brand: string | null; categories: string[]; sizes: string[]; price: number; state: string }> = {},
): ProductCardView =>
	({
		slug,
		title: slug,
		brand: overrides.brand === null ? null : { name: `Brand ${overrides.brand ?? "a"}`, slug: overrides.brand ?? "a" },
		categories: (overrides.categories ?? ["apparel"]).map((c) => ({ name: c.toUpperCase(), slug: c })),
		sizes: (overrides.sizes ?? []).map((label) => ({ label, isAvailable: true })),
		price: { amount: overrides.price ?? 2000, currency: "usd", isRange: false, priceId: null },
		availability: { state: overrides.state ?? "in_stock", lowCount: null },
	}) as unknown as ProductCardView;

const ITEMS = [
	item("tee", { brand: "a", categories: ["apparel", "sale"], sizes: ["S", "M"], price: 2800 }),
	item("hoodie", { brand: "b", categories: ["apparel"], sizes: ["M", "L"], price: 6800 }),
	item("mat", { brand: "b", categories: ["desk"], price: 3900 }),
	item("pin", { brand: "a", categories: ["stickers", "sale"], price: 800, state: "sold_out" }),
];

const contextFor = (query: string): ListingContext => ({
	locale: "en",
	copy: catalogCopy.en,
	state: parseListing(new URLSearchParams(query)),
	basePath: "/shop",
	facets: ITEMS.map(toFacet),
	brands: brandsOf(ITEMS),
	categories: categoriesOf(ITEMS),
});

describe("categoriesOf", () => {
	it("lists the categories of the products, most populated first, with counts", () => {
		expect(categoriesOf(ITEMS).map((c) => [c.slug, c.count])).toEqual([
			["apparel", 2],
			["sale", 2],
			["desk", 1],
			["stickers", 1],
		]);
	});
});

describe("categoryBarProps", () => {
	it("starts with All, marks the current category and keeps the other filters and the sort", () => {
		const bar = categoryBarProps(contextFor("category=apparel&brand=b&sort=name"));
		expect(bar.items[0]).toMatchObject({ label: "All", isCurrent: false, href: "/shop?sort=name&brand=b" });
		const apparel = bar.items.find((entry) => entry.label === "APPAREL");
		expect(apparel).toMatchObject({ isCurrent: true, href: "/shop?category=apparel&sort=name&brand=b" });
		expect(bar.items.find((entry) => entry.label === "DESK")?.href).toBe("/shop?category=desk&sort=name&brand=b");
	});

	it("All is current when no category is chosen", () => {
		expect(categoryBarProps(contextFor("")).items.filter((entry) => entry.isCurrent)).toHaveLength(1);
		expect(categoryBarProps(contextFor("")).items[0]?.isCurrent).toBe(true);
	});
});

describe("activeFiltersOf", () => {
	it("makes one removable chip per applied value, each linking to the URL without it", () => {
		const chips = activeFiltersOf(contextFor("category=apparel&brand=a&brand=b&size=M&inStock=1&price=-2499"));
		expect(chips.map((chip) => chip.label)).toEqual(["In stock only", "Size M", "Brand a", "Brand b", "Under $25"]);
		expect(chips.map((chip) => chip.removeHref)).toEqual([
			"/shop?category=apparel&brand=a&brand=b&size=M&price=-2499",
			"/shop?category=apparel&brand=a&brand=b&inStock=1&price=-2499",
			"/shop?category=apparel&brand=b&size=M&inStock=1&price=-2499",
			"/shop?category=apparel&brand=a&size=M&inStock=1&price=-2499",
			"/shop?category=apparel&brand=a&brand=b&size=M&inStock=1",
		]);
		expect(chips[1]?.removeLabel).toBe("Remove filter: Size M");
	});

	it("is empty when only the category and the sort are set", () => {
		expect(activeFiltersOf(contextFor("category=apparel&sort=name"))).toEqual([]);
	});

	it("labels a legacy price range", () => {
		expect(activeFiltersOf(contextFor("priceMax=100"))[0]?.label).toBe("Up to $1");
	});
});

describe("toolbarProps", () => {
	it("badge counts every applied filter and the sort form keeps them all", () => {
		const toolbar = toolbarProps(contextFor("category=apparel&brand=a&brand=b&size=M&sort=name"));
		expect(toolbar.filters?.activeCount).toBe(3);
		expect(toolbar.keep).toEqual({ category: "apparel", brand: ["a", "b"], size: "M" });
		expect(toolbar.sort.value).toBe("name");
		expect(toolbar.clearAll?.href).toBe("/shop?category=apparel&sort=name");
	});

	it("shows no badge count at zero", () => {
		expect(toolbarProps(contextFor("")).filters?.activeCount).toBe(0);
	});
});

describe("filtersProps", () => {
	const groupsOf = (query: string) => filtersProps(contextFor(query), 4).groups;
	const group = (query: string, id: string) => groupsOf(query).find((entry) => entry.id === id)!;

	it("orders the groups: availability, size, brand, price", () => {
		expect(groupsOf("").map((entry) => entry.id)).toEqual(["filter-stock", "filter-size", "filter-brand", "filter-price"]);
	});

	it("checks every chosen brand and counts each against the other filters", () => {
		const brand = group("brand=a&brand=b&category=apparel", "filter-brand");
		if (brand.kind !== "checkbox") throw new Error("brand is a checkbox list");
		expect(brand.options.map((o) => [o.value, o.isChecked, o.count])).toEqual([
			["a", true, 1],
			["b", true, 1],
		]);
	});

	it("lists the buyable sizes in size order with counts", () => {
		const size = group("", "filter-size");
		if (size.kind !== "chips") throw new Error("size is a chip group");
		expect(size.options.map((o) => [o.value, o.count])).toEqual([
			["S", 1],
			["M", 2],
			["L", 1],
		]);
	});

	it("price is one choice: Any plus the presets, the current preset checked", () => {
		const price = group("price=2500-4999", "filter-price");
		if (price.kind !== "segmented") throw new Error("price is segmented");
		expect(price.options.map((o) => [o.label, o.isChecked])).toEqual([
			["Any", false],
			["Under $25", false],
			["$25–$50", true],
			["$50–$100", false],
			["$100+", false],
		]);
	});

	it("a legacy range that is no preset becomes its own checked choice, so applying keeps it", () => {
		const price = group("priceMax=100", "filter-price");
		if (price.kind !== "segmented") throw new Error("price is segmented");
		expect(price.options.at(-1)).toMatchObject({ label: "Up to $1", isChecked: true, value: "-100" });
		expect(price.options[0]?.isChecked).toBe(false);
	});

	it("the footer says how many results the choices leave and carries the plural forms", () => {
		const props = filtersProps(contextFor(""), 4);
		expect(props.results.label).toBe("Show 4 results");
		expect(props.results.forms).toMatchObject({ one: "Show 1 result", zero: "No results" });
		expect(props.keep).toEqual({});
		expect(filtersProps(contextFor("category=desk&sort=name"), 1).keep).toEqual({ category: "desk", sort: "name" });
	});
});

describe("labels", () => {
	it("results label follows the plural rules and has a zero form", () => {
		const ctx = contextFor("");
		expect([0, 1, 7].map((n) => resultsLabel(ctx, n))).toEqual(["No results", "Show 1 result", "Show 7 results"]);
		const pl = { ...ctx, locale: "pl" as const, copy: catalogCopy.pl };
		expect([1, 2, 5].map((n) => resultsLabel(pl, n))).toEqual(["Pokaż 1 wynik", "Pokaż 2 wyniki", "Pokaż 5 wyników"]);
	});

	it("product count says 1 product, not 1 products", () => {
		const ctx = contextFor("");
		expect([1, 3].map((n) => countLabel(ctx, n))).toEqual(["1 product", "3 products"]);
		expect(countLabel({ ...ctx, locale: "pl", copy: catalogCopy.pl }, 3)).toBe("3 produkty");
	});
});

describe("empty result links", () => {
	it("starts from a category with the filters dropped and the sort kept", () => {
		const links = startFromCategoryLinks(contextFor("brand=a&size=M&sort=name&priceMax=100"));
		expect(links[0]).toEqual({ label: "APPAREL", href: "/shop?category=apparel&sort=name" });
	});

	it("clear all goes to the listing without filters", () => {
		expect(clearAllLink(contextFor("brand=a&inStock=1")).href).toBe("/shop");
	});
});

describe("withKnownCategory", () => {
	const categories = categoriesOf(ITEMS);

	it("keeps a category some product belongs to", () => {
		const state = parseListing(new URLSearchParams("category=desk&brand=b"));
		expect(withKnownCategory(state, categories)).toEqual(state);
	});

	it("turns a category nobody sells into no category, keeping every other choice", () => {
		const state = parseListing(new URLSearchParams("category=gone&brand=b&sort=price-asc"));
		const resolved = withKnownCategory(state, categories);
		expect(resolved.category).toBeNull();
		expect(resolved.brands).toEqual(["b"]);
		expect(resolved.sort).toBe("price-asc");
	});

	it("leaves a state without a category alone", () => {
		const state = parseListing(new URLSearchParams(""));
		expect(withKnownCategory(state, categories)).toBe(state);
	});

	it("makes Clear all filters lead somewhere new for a stale category", () => {
		const ctx = contextFor("category=gone&brand=b");
		const resolved = { ...ctx, state: withKnownCategory(ctx.state, ctx.categories) };
		expect(clearAllLink(resolved).href).toBe("/shop");
		expect(clearAllLink(ctx).href).toBe("/shop?category=gone");
	});
});
