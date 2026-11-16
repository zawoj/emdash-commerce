import { describe, expect, it } from "vitest";

import { formatMoney } from "../../lib/money";
import { LOCALES } from "../../lib/i18n";
import { homeStructure } from "./config";
import { homeCopy } from "./copy";
import { loadHomeConfig } from "./load-config";

describe("loadHomeConfig", () => {
	it("serves English hero copy for en", () => {
		const config = loadHomeConfig(LOCALES.en);
		expect(config.hero.heading).toBe(homeCopy.en.hero.heading);
		expect(config.hero.heading).toBe("Merch for people who ship at the edge.");
		expect(config.rails[0]?.title).toBe("New arrivals");
	});

	it("serves Polish hero copy for pl", () => {
		const config = loadHomeConfig(LOCALES.pl);
		expect(config.hero.heading).toContain("wdrażają");
		expect(config.faq[1]?.question).toContain("dostawa");
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

describe("home structure and copy", () => {
	it.each([LOCALES.en, LOCALES.pl])("names every rail and category pill in the copy (%s)", (locale) => {
		const strings = homeCopy[locale];
		for (const rail of homeStructure.rails) {
			expect(strings.railTitles, `title of rail ${rail.key}`).toHaveProperty(rail.key);
			if ("moreHref" in rail) expect(strings.railMore, `more of rail ${rail.key}`).toHaveProperty(rail.key);
		}
		for (const item of homeStructure.activityCategories) expect(strings.activity).toHaveProperty(item.slug);
	});

	it("names the category pills from the copy, not from the slug", () => {
		const config = loadHomeConfig(LOCALES.en);
		expect(config.activityCategories.map((item) => item.name)).toEqual([
			"Apparel",
			"Desk setup",
			"Drinkware",
			"Stickers",
			"Bundles",
			"Sale",
		]);
		expect(config.rails.find((rail) => rail.key === "bundles")?.moreLabel).toBe("View all");
	});
});
