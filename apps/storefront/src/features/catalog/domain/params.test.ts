import { describe, expect, it } from "vitest";

import { parseListing, listingQuery } from "./params";

describe("parseListing", () => {
	it("reads sort and stock filter", () => {
		const state = parseListing(new URLSearchParams("sort=price-asc&inStock=1"));
		expect(state.sort).toBe("price-asc");
		expect(state.inStock).toBe(true);
		expect(listingQuery(state)).toContain("sort=price-asc");
	});
});
