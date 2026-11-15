import { describe, expect, it } from "vitest";

import { formatMoney } from "../../lib/money";
import { LOCALES } from "../../lib/i18n";
import { homeCopy } from "./copy";
import { loadHomeConfig } from "./load-config";

describe("loadHomeConfig", () => {
	it("serves English hero copy for en", () => {
		const config = loadHomeConfig(LOCALES.en);
		expect(config.hero.heading).toBe(homeCopy.en.hero.heading);
		expect(config.hero.voltText).toBe("GO.");
		expect(config.rails[0]?.title).toBe("Featured");
	});

	it("serves Polish hero copy for pl", () => {
		const config = loadHomeConfig(LOCALES.pl);
		expect(config.hero.heading).toContain("TRENUJ");
		expect(config.faq[0]?.question).toContain("dostawa");
	});
});

describe("formatMoney", () => {
	it("formats PLN for en and pl locales", () => {
		const enLabel = formatMoney(12_900, LOCALES.en, "PLN");
		const plLabel = formatMoney(12_900, LOCALES.pl, "PLN");
		expect(enLabel).toMatch(/129/);
		expect(plLabel).toContain("zł");
		expect(plLabel).toMatch(/129,00|129\s*00/);
	});
});
