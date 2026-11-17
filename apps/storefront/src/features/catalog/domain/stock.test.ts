import { describe, expect, it } from "vitest";

import { catalogCopy } from "../copy";
import { stockLowLabel } from "./stock";

describe("stockLowLabel", () => {
	it("English: the last single item is not '1 items'", () => {
		expect(stockLowLabel("en", catalogCopy.en, 1)).toBe("Last item");
		expect(stockLowLabel("en", catalogCopy.en, 3)).toBe("Last 3 items");
		expect(stockLowLabel("en", catalogCopy.en, null)).toBe("Last item");
	});

	it("Polish: one, few and many", () => {
		expect(stockLowLabel("pl", catalogCopy.pl, 1)).toBe("Ostatnia sztuka");
		expect(stockLowLabel("pl", catalogCopy.pl, 3)).toBe("Ostatnie 3 sztuki");
		expect(stockLowLabel("pl", catalogCopy.pl, 5)).toBe("Ostatnie 5 sztuk");
	});
});
