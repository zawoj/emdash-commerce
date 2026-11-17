import { describe, expect, it } from "vitest";

import { pluralize } from "./strings";

const FORMS = { one: "1 produkt", few: "{count} produkty", many: "{count} produktów", other: "{count} produktu" };

describe("pluralize", () => {
	it("picks the Polish form of the count", () => {
		expect(pluralize("pl", 1, FORMS)).toBe("1 produkt");
		expect(pluralize("pl", 2, FORMS)).toBe("2 produkty");
		expect(pluralize("pl", 5, FORMS)).toBe("5 produktów");
		expect(pluralize("pl", 22, FORMS)).toBe("22 produkty");
		expect(pluralize("pl", 0, FORMS)).toBe("0 produktów");
	});

	it("English has one and other; a missing form falls back to other", () => {
		expect(pluralize("en", 1, { one: "1 product", other: "{count} products" })).toBe("1 product");
		expect(pluralize("en", 3, { one: "1 product", other: "{count} products" })).toBe("3 products");
		expect(pluralize("en", 3, { other: "{count} items" })).toBe("3 items");
	});
});

describe("pluralize across the shop's count labels", () => {
	const cartEn = { one: "1 item in the cart", other: "{count} items in the cart" };
	const cartPl = { one: "1 produkt w koszyku", few: "{count} produkty w koszyku", many: "{count} produktów w koszyku", other: "{count} produktu w koszyku" };

	it("English: 1 is singular, 2 and 5 are plural", () => {
		expect(pluralize("en", 1, cartEn)).toBe("1 item in the cart");
		expect(pluralize("en", 2, cartEn)).toBe("2 items in the cart");
		expect(pluralize("en", 5, cartEn)).toBe("5 items in the cart");
	});

	it("Polish: one, few (2, 22) and many (5, 12)", () => {
		expect(pluralize("pl", 1, cartPl)).toBe("1 produkt w koszyku");
		expect(pluralize("pl", 2, cartPl)).toBe("2 produkty w koszyku");
		expect(pluralize("pl", 5, cartPl)).toBe("5 produktów w koszyku");
		expect(pluralize("pl", 12, cartPl)).toBe("12 produktów w koszyku");
		expect(pluralize("pl", 22, cartPl)).toBe("22 produkty w koszyku");
	});
});
