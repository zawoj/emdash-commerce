import { describe, expect, it } from "vitest";

import { MAX_FILTER_VALUES } from "./constants";
import {
	appliedFilterCount,
	emptyListing,
	listingHref,
	listingQuery,
	parsePriceRange,
	parseListing,
	withoutFilter,
	withoutFilters,
} from "./params";

const parse = (query: string) => parseListing(new URLSearchParams(query));

describe("parseListing", () => {
	it("reads sort and stock filter", () => {
		const state = parse("sort=price-asc&inStock=1");
		expect(state.sort).toBe("price-asc");
		expect(state.inStock).toBe(true);
		expect(listingQuery(state)).toContain("sort=price-asc");
	});

	it("keeps every chosen brand and size, once each", () => {
		const state = parse("brand=edge-desk&brand=workers-supply&brand=edge-desk&size=M&size=S");
		expect(state.brands).toEqual(["edge-desk", "workers-supply"]);
		expect(state.sizes).toEqual(["M", "S"]);
	});

	it("reads the category and drops blank or oversized values", () => {
		expect(parse("category=apparel").category).toBe("apparel");
		expect(parse("category=%20").category).toBeNull();
		expect(parse(`category=${"x".repeat(65)}`).category).toBeNull();
		expect(parse(`brand=${"x".repeat(65)}&brand=`).brands).toEqual([]);
	});

	it("bounds how many values one URL can carry", () => {
		const many = Array.from({ length: MAX_FILTER_VALUES + 10 }, (_, index) => `size=S${index}`).join("&");
		expect(parse(many).sizes).toHaveLength(MAX_FILTER_VALUES);
	});

	it("still accepts the legacy priceMin and priceMax pair", () => {
		const state = parse("priceMin=2500&priceMax=4999");
		expect([state.priceMin, state.priceMax]).toEqual([2500, 4999]);
		// ...and writes it back as the one `price` parameter.
		expect(listingQuery(state)).toBe("price=2500-4999");
	});

	it("prefers `price` over the legacy pair and ignores a malformed one", () => {
		expect(parse("price=-2499&priceMin=1&priceMax=9").priceMax).toBe(2499);
		expect(parse("price=abc&priceMax=900").priceMax).toBe(900);
		expect(parse("price=-").priceMax).toBeNull();
		expect(parse("price=").priceMin).toBeNull();
	});
});

describe("parsePriceRange", () => {
	it("reads open and closed ranges, a zero floor is open", () => {
		expect(parsePriceRange("2500-4999")).toEqual({ min: 2500, max: 4999 });
		expect(parsePriceRange("-2499")).toEqual({ min: null, max: 2499 });
		expect(parsePriceRange("10000-")).toEqual({ min: 10000, max: null });
		expect(parsePriceRange("0-2499")).toEqual({ min: null, max: 2499 });
	});

	it("rejects anything that is not min-max", () => {
		for (const bad of ["", "-", "12", "a-b", "1-2-3", "-5-", "1e3-5"]) expect(parsePriceRange(bad)).toBeNull();
	});
});

describe("listingQuery / listingHref", () => {
	it("leaves defaults out and repeats multi-select parameters", () => {
		expect(listingHref("/shop", emptyListing())).toBe("/shop");
		const state = { ...emptyListing(), category: "apparel", brands: ["a", "b"], sizes: ["M"], inStock: true, priceMax: 2499 };
		expect(listingQuery(state)).toBe("category=apparel&brand=a&brand=b&size=M&inStock=1&price=-2499");
	});

	it("round-trips through parseListing", () => {
		const state = parse("category=desk&sort=name&brand=a&brand=b&size=XL&inStock=1&price=5000-9999");
		expect(parse(listingQuery(state))).toEqual(state);
	});
});

describe("filter edits", () => {
	const state = parse("category=desk&sort=name&brand=a&brand=b&size=M&size=L&inStock=1&price=-2499");

	it("removes one value of a multi-select and nothing else", () => {
		expect(withoutFilter(state, "brand", "a").brands).toEqual(["b"]);
		expect(withoutFilter(state, "size", "M").sizes).toEqual(["L"]);
		expect(withoutFilter(state, "brand", "a").sizes).toEqual(["M", "L"]);
	});

	it("removes the stock switch and the price range", () => {
		expect(withoutFilter(state, "inStock").inStock).toBe(false);
		const noPrice = withoutFilter(state, "price");
		expect([noPrice.priceMin, noPrice.priceMax]).toEqual([null, null]);
	});

	it("clearing every filter keeps the category and the sort", () => {
		expect(listingQuery(withoutFilters(state))).toBe("category=desk&sort=name");
	});

	it("counts the applied filters of the panel, not the category", () => {
		expect(appliedFilterCount(state)).toBe(1 + 2 + 2 + 1);
		expect(appliedFilterCount(parse("category=desk&sort=name"))).toBe(0);
	});
});
