import { pluralLabel } from "@emdash-commerce/design-system/plural-label";
import { describe, expect, it } from "vitest";

import { cartCountLabelOf } from "./cart-count";
import { shellCopy } from "./copy";

const spoken = (locale: "en" | "pl", count: number): string => {
	const { labelTemplate, labelForms } = cartCountLabelOf(shellCopy[locale], locale);
	return pluralLabel(labelTemplate, labelForms, locale, count);
};

describe("the spoken cart count the header badge reads out", () => {
	it("English says 1 item and 2 or 5 items", () => {
		expect(spoken("en", 1)).toBe("1 item in the cart");
		expect(spoken("en", 2)).toBe("2 items in the cart");
		expect(spoken("en", 5)).toBe("5 items in the cart");
	});

	it("Polish has one, few and many forms", () => {
		expect(spoken("pl", 1)).toBe("1 produkt w koszyku");
		expect(spoken("pl", 2)).toBe("2 produkty w koszyku");
		expect(spoken("pl", 5)).toBe("5 produktów w koszyku");
		expect(spoken("pl", 12)).toBe("12 produktów w koszyku");
		expect(spoken("pl", 22)).toBe("22 produkty w koszyku");
	});

	it("falls back to the template when a form is not given", () => {
		expect(pluralLabel("{count} things", { one: "one thing" }, "pl", 2)).toBe("2 things");
	});
});
