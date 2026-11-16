import { describe, expect, it } from "vitest";

import { catalogCopy } from "../copy";
import { parsePriceRange } from "./params";
import { formatWhole, isPreset, pricePresets, priceRangeLabel } from "./price-presets";

describe("pricePresets", () => {
	it("splits the price line at 25, 50 and 100 with no overlap and no gap", () => {
		expect(pricePresets().map((preset) => preset.value)).toEqual(["-2499", "2500-4999", "5000-9999", "10000-"]);
	});

	it("every value is a range the URL parser reads back unchanged", () => {
		for (const preset of pricePresets()) expect(parsePriceRange(preset.value)).toEqual({ min: preset.min, max: preset.max });
	});

	it("every whole-dollar price falls into exactly one preset", () => {
		for (let minor = 0; minor <= 20000; minor += 100) {
			const hits = pricePresets().filter(
				(preset) => (preset.min === null || minor >= preset.min) && (preset.max === null || minor <= preset.max),
			);
			expect(hits).toHaveLength(1);
		}
	});

	it("tells a preset from a custom range", () => {
		expect(isPreset(2500, 4999)).toBe(true);
		expect(isPreset(null, 100)).toBe(false);
	});
});

describe("priceRangeLabel", () => {
	const en = catalogCopy.en;

	it("names presets the way a shopper reads them", () => {
		const labels = pricePresets().map((preset) => priceRangeLabel(preset, "en", en));
		expect(labels).toEqual(["Under $25", "$25–$50", "$50–$100", "$100+"]);
	});

	it("names a range from an old link without pretending it is a preset", () => {
		expect(priceRangeLabel({ min: null, max: 100 }, "en", en)).toBe("Up to $1");
		expect(priceRangeLabel({ min: 3050, max: null }, "en", en)).toBe("From $30.50");
		expect(priceRangeLabel({ min: 3000, max: 6000 }, "en", en)).toBe("$30–$60");
	});

	it("speaks Polish too", () => {
		expect(priceRangeLabel({ min: null, max: 2499 }, "pl", catalogCopy.pl)).toContain("Poniżej");
	});
});

describe("formatWhole", () => {
	it("drops the cents of a whole amount and keeps them otherwise", () => {
		expect(formatWhole(2500, "en")).toBe("$25");
		expect(formatWhole(2550, "en")).toBe("$25.50");
	});
});
