import { describe, expect, it } from "vitest";

import { catalogCopy } from "./copy";

const placeholders = (text: string): string[] => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!).sort();

describe("catalog copy", () => {
	const keys = Object.keys(catalogCopy.en) as (keyof typeof catalogCopy.en)[];

	it("has the same keys in English and Polish", () => {
		expect(Object.keys(catalogCopy.pl).sort()).toEqual([...keys].sort());
	});

	it("never leaves a string empty", () => {
		for (const locale of ["en", "pl"] as const) for (const key of keys) expect(catalogCopy[locale][key].trim(), `${locale}.${key}`).not.toBe("");
	});

	it("keeps the same placeholders in both languages, so a template never loses its value", () => {
		for (const key of keys) {
			// A plural form that names its number in words ("1 product") has no placeholder in either language.
			if (/One$|None$/.test(key)) continue;
			expect(placeholders(catalogCopy.pl[key]), key).toEqual(placeholders(catalogCopy.en[key]));
		}
	});
});
