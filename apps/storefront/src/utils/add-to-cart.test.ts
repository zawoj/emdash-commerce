import { describe, expect, it } from "vitest";
import { buildCartLineBody } from "./add-to-cart";

describe("buildCartLineBody", () => {
	it("defaults to add mode with quantity 1", () => {
		expect(buildCartLineBody("price_01")).toEqual({
			priceId: "price_01",
			quantity: 1,
			mode: "add",
		});
	});

	it("supports set mode and custom quantity", () => {
		expect(buildCartLineBody("price_02", 3, "set")).toEqual({
			priceId: "price_02",
			quantity: 3,
			mode: "set",
		});
	});
});
