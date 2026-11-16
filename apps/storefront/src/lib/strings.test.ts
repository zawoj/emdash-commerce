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
