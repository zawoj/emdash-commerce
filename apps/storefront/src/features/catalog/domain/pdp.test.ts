import { describe, expect, it } from "vitest";

import { LOCALES } from "../../../lib/i18n";
import { addBusinessDays, bundleOf, deliveryRange, specsWithoutIncludes } from "./pdp";

const iso = (date: Date): string => date.toISOString().slice(0, 10);

describe("addBusinessDays", () => {
	it("counts Monday to Thursday inside the week", () => {
		expect(iso(addBusinessDays(new Date("2026-11-16T10:00:00Z"), 3))).toBe("2026-11-19");
	});

	it("skips the weekend", () => {
		// Friday + 3 business days = Wednesday
		expect(iso(addBusinessDays(new Date("2026-11-13T10:00:00Z"), 3))).toBe("2026-11-18");
	});

	it("starts counting on Monday when ordered on a Sunday", () => {
		expect(iso(addBusinessDays(new Date("2026-11-15T10:00:00Z"), 1))).toBe("2026-11-16");
	});
});

describe("deliveryRange", () => {
	it("formats a concrete date range for the locale", () => {
		const range = deliveryRange(new Date("2026-11-16T10:00:00Z"), LOCALES.en);
		expect(range).toContain("Nov 19");
		expect(range).toContain("Nov 23");
		expect(range).toContain(" – ");
	});

	it("uses the Polish month names for pl", () => {
		expect(deliveryRange(new Date("2026-11-16T10:00:00Z"), LOCALES.pl)).toContain("lis");
	});
});

describe("bundleOf", () => {
	const specs = [{ label: "Includes", value: "Mat, Lamp, Cable Tidy Kit, Orange Keycap Set" }];
	const description = [
		{ _type: "block", children: [{ text: "Everything in one box." }] },
		{ _type: "block", children: [{ text: "$109 instead of $147 for the four items bought apart." }] },
	];

	it("splits the Includes line into parts and finds the saving sentence", () => {
		expect(bundleOf(specs, description)).toEqual({
			items: ["Mat", "Lamp", "Cable Tidy Kit", "Orange Keycap Set"],
			saving: "$109 instead of $147",
		});
	});

	it("is not a bundle without an Includes row", () => {
		expect(bundleOf([{ label: "Material", value: "Nylon" }], description)).toBeNull();
	});

	it("keeps the parts when the description states no saving", () => {
		expect(bundleOf(specs, null)?.saving).toBeNull();
	});

	it("drops the Includes row from the specification", () => {
		expect(specsWithoutIncludes([...specs, { label: "SKU", value: "BND-DESK" }])).toEqual([{ label: "SKU", value: "BND-DESK" }]);
	});

	const textBlock = (text: string) => [{ _type: "block", children: [{ text }] }];
	const savingOf = (text: string) => bundleOf(specs, textBlock(text))?.saving ?? null;

	it("reads the two amounts, not the sentence around them", () => {
		expect(savingOf("$109.00 instead of $147.00, for the four items bought apart.")).toBe("$109.00 instead of $147.00");
		expect(savingOf("Get it for $69 instead of $91.")).toBe("$69 instead of $91");
	});

	it("reads a Polish saving with the currency after the amount", () => {
		expect(savingOf("109 zł zamiast 147 zł za cztery produkty.")).toBe("109 zł zamiast 147 zł");
	});

	it("shows no saving when the words are there but the amounts are not", () => {
		expect(savingOf("A kit that is better instead of buying parts one by one.")).toBeNull();
		expect(savingOf("$109 instead of buying parts.")).toBeNull();
	});

	it("takes the first block that states a saving", () => {
		const blocks = [...textBlock("No saving here."), ...textBlock("$50 instead of $70."), ...textBlock("$1 instead of $2.")];
		expect(bundleOf(specs, blocks)?.saving).toBe("$50 instead of $70");
	});
});
