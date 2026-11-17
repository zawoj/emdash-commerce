import type { Locale } from "../../lib/i18n";
import { homeCopy, homeRailTitle } from "./copy";
import { homeStructure, type HomeConfig } from "./config";

/** Runtime home config: structure plus locale-specific copy. */
export const loadHomeConfig = (locale: Locale): HomeConfig => {
	const strings = homeCopy[locale];
	const railMore = (key: string): string | undefined =>
		key in strings.railMore ? strings.railMore[key as keyof typeof strings.railMore] : undefined;

	return {
		hero: {
			...homeStructure.hero,
			eyebrow: strings.hero.eyebrow,
			heading: strings.hero.heading,
			ctaLabel: strings.hero.ctaLabel,
			secondaryLabel: strings.hero.secondaryLabel,
			productLabel: strings.hero.productLabel,
		},
		rails: homeStructure.rails.map((rail) => ({
			...rail,
			title: homeRailTitle(locale, rail.key),
			moreLabel: railMore(rail.key),
		})),
		spotlight: {
			...homeStructure.spotlight,
			eyebrow: strings.spotlight.eyebrow,
			specs: strings.spotlight.specs,
		},
		look: {
			eyebrow: strings.look.eyebrow,
			heading: strings.look.heading,
			ctaLabel: strings.look.ctaLabel,
		},
		activityCategories: homeStructure.activityCategories.map((item) => ({
			...item,
			name: strings.activity[item.slug as keyof typeof strings.activity] ?? item.slug,
		})),
		faq: strings.faq,
		newsletterAction: homeStructure.newsletterAction,
	};
};
