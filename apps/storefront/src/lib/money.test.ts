import { describe, expect, it } from "vitest";

import { LOCALES } from "./i18n";
import { currencySymbolOf, DEFAULT_CURRENCY, formatMoney } from "./money";

describe("money", () => {
	it("uses USD unless a price names another currency", () => {
		expect(DEFAULT_CURRENCY).toBe("USD");
		expect(formatMoney(2_800, LOCALES.en)).toBe("$28.00");
		expect(formatMoney(2_800, LOCALES.en, "pln")).toMatch(/28\.00/);
	});

	it("names the filter unit after the currency, whatever the casing", () => {
		expect(currencySymbolOf(LOCALES.en)).toBe("$");
		expect(currencySymbolOf(LOCALES.en, "usd")).toBe("$");
		expect(currencySymbolOf(LOCALES.pl, "PLN")).toBe("zł");
	});
});
