import type { ProductCardView } from "@emdash-commerce/plugin-stripe/contracts";
import { describe, expect, it } from "vitest";

import {
	countMatching,
	countOption,
	matchesListing,
	parseFacets,
	serializeFacets,
	sizesOf,
	toFacet,
	withOption,
	type ItemFacet,
} from "./facets";
import { emptyListing, type ListingState } from "./params";

const facet = (overrides: Partial<ItemFacet> & { slug: string }): ItemFacet => ({
	categories: [],
	brand: null,
	sizes: [],
	price: 1000,
	isInStock: true,
	...overrides,
});

const FACETS: ItemFacet[] = [
	facet({ slug: "tee", categories: ["apparel"], brand: "workers", sizes: ["S", "M"], price: 2800 }),
	facet({ slug: "hoodie", categories: ["apparel", "outerwear"], brand: "workers", sizes: ["M", "L"], price: 6800 }),
	facet({ slug: "jacket", categories: ["apparel", "outerwear"], brand: "zero", sizes: ["L"], price: 8900 }),
	facet({ slug: "mat", categories: ["desk"], brand: "edge", price: 3900 }),
	facet({ slug: "pin", categories: ["stickers"], brand: "workers", price: 800, isInStock: false }),
	facet({ slug: "poster", categories: ["stickers"], price: 500 }),
];

const state = (overrides: Partial<ListingState> = {}): ListingState => ({ ...emptyListing(), ...overrides });
const slugs = (s: ListingState) => FACETS.filter((f) => matchesListing(f, s)).map((f) => f.slug);

describe("matchesListing", () => {
	it("matches everything when nothing is applied", () => {
		expect(countMatching(FACETS, state())).toBe(FACETS.length);
	});

	it("narrows by category", () => {
		expect(slugs(state({ category: "outerwear" }))).toEqual(["hoodie", "jacket"]);
	});

	it("takes any of the chosen brands (multi-select is a union inside the group)", () => {
		expect(slugs(state({ brands: ["edge", "zero"] }))).toEqual(["jacket", "mat"]);
	});

	it("a product without a brand never matches a brand filter", () => {
		expect(slugs(state({ brands: ["workers"] }))).not.toContain("poster");
	});

	it("takes any of the chosen sizes", () => {
		expect(slugs(state({ sizes: ["S", "L"] }))).toEqual(["tee", "hoodie", "jacket"]);
	});

	it("keeps only what can be bought with the stock switch", () => {
		expect(slugs(state({ inStock: true }))).not.toContain("pin");
	});

	it("price bounds are inclusive and either end may be open", () => {
		expect(slugs(state({ priceMin: 2800, priceMax: 6800 }))).toEqual(["tee", "hoodie", "mat"]);
		expect(slugs(state({ priceMax: 800 }))).toEqual(["pin", "poster"]);
		expect(slugs(state({ priceMin: 8900 }))).toEqual(["jacket"]);
	});

	it("groups combine with AND", () => {
		expect(slugs(state({ category: "apparel", brands: ["workers"], sizes: ["M"], priceMax: 3000 }))).toEqual(["tee"]);
	});
});

describe("countOption", () => {
	it("counts what one option leaves next to the other applied filters", () => {
		const applied = state({ category: "apparel" });
		expect(countOption(FACETS, applied, "brand", "workers")).toBe(2);
		expect(countOption(FACETS, applied, "brand", "zero")).toBe(1);
		expect(countOption(FACETS, applied, "size", "M")).toBe(2);
		expect(countOption(FACETS, applied, "inStock", "1")).toBe(3);
	});

	it("an option is counted on its own: other chosen values of its group do not add up", () => {
		const applied = state({ brands: ["workers", "zero"] });
		expect(countOption(FACETS, applied, "brand", "edge")).toBe(1);
	});

	it("a price option replaces the applied range", () => {
		const applied = state({ priceMax: 100 });
		expect(countOption(FACETS, applied, "price", "-1000")).toBe(2);
		expect(countOption(FACETS, applied, "price", "5000-")).toBe(2);
		expect(countOption(FACETS, applied, "price", "")).toBe(FACETS.length);
	});

	it("withOption leaves the other groups alone", () => {
		const applied = state({ category: "apparel", sizes: ["M"] });
		expect(withOption(applied, "brand", "zero")).toEqual({ ...applied, brands: ["zero"] });
	});
});

describe("sizesOf", () => {
	it("lists sizes in size order, unknown ones after in catalog order", () => {
		const sizes = sizesOf([facet({ slug: "a", sizes: ["XL", "One size", "S"] }), facet({ slug: "b", sizes: ["XS", "M", "42"] })]);
		expect(sizes).toEqual(["XS", "S", "M", "XL", "One size", "42"]);
	});
});

describe("toFacet", () => {
	const item = {
		slug: "tee",
		categories: [{ name: "Apparel", slug: "apparel" }],
		brand: { name: "Workers", slug: "workers" },
		sizes: [
			{ label: "S", isAvailable: true },
			{ label: "M", isAvailable: false },
		],
		price: { amount: 2800, currency: "usd", isRange: true, priceId: null },
		availability: { state: "sold_out", lowCount: null },
	} as unknown as ProductCardView;

	it("keeps what the filters read: slugs, buyable sizes, the price, stock", () => {
		expect(toFacet(item)).toEqual({
			slug: "tee",
			categories: ["apparel"],
			brand: "workers",
			sizes: ["S"],
			price: 2800,
			isInStock: false,
		});
	});

	it("a low-stock or backorder product still counts as in stock", () => {
		for (const stock of ["low", "backorder", "in_stock"] as const) {
			const view = { ...item, availability: { state: stock, lowCount: null } } as ProductCardView;
			expect(toFacet(view).isInStock).toBe(true);
		}
	});
});

describe("serializeFacets / parseFacets", () => {
	it("round-trips", () => {
		expect(parseFacets(serializeFacets(FACETS))).toEqual(FACETS);
	});

	it("a '<' can never close the script tag it is embedded in", () => {
		const json = serializeFacets([facet({ slug: "</script><img src=x>" })]);
		expect(json).not.toContain("<");
		expect(parseFacets(json)[0]?.slug).toBe("</script><img src=x>");
	});

	it("malformed input is an empty list", () => {
		for (const bad of [null, undefined, "", "{", '{"a":1}', "null"]) expect(parseFacets(bad)).toEqual([]);
	});
});
