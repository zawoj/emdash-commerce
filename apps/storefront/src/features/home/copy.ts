import type { Locale } from "../../lib/i18n";
import type { HomeFaqItem } from "./config";

export interface HomeHeroCopy {
	eyebrow: string;
	heading: string;
	voltText: string;
	blackText: string;
	ctaLabel: string;
	secondaryLabel: string;
	productLabel: string;
}

export interface HomeSpotlightCopy {
	eyebrow: string;
	specs: readonly { label: string; value: string }[];
}

export interface HomeLookCopy {
	eyebrow: string;
	heading: string;
	ctaLabel: string;
	listHeading: string;
}

export interface HomeActivityCopy {
	readonly running: string;
	readonly cycling: string;
	readonly triathlon: string;
}

export interface HomeRailTitles {
	readonly featured: string;
	readonly new: string;
	readonly sale: string;
	readonly running: string;
	readonly cycling: string;
	readonly triathlon: string;
}

export interface HomeLocaleCopy {
	hero: HomeHeroCopy;
	railTitles: HomeRailTitles;
	railMore: {
		readonly new: string;
		readonly sale: string;
		readonly running: string;
		readonly cycling: string;
		readonly triathlon: string;
	};
	tabCategories: HomeActivityCopy & { training: string };
	spotlight: HomeSpotlightCopy;
	look: HomeLookCopy;
	activity: HomeActivityCopy;
	faq: readonly HomeFaqItem[];
	marquee: string;
}

const en: HomeLocaleCopy = {
	hero: {
		eyebrow: "Triathlon · Running · Cycling · Training",
		heading: "TRAIN HARD. GIVE YOUR BEST.",
		voltText: "GO.",
		blackText: "KEEP\nGOING",
		ctaLabel: "New arrivals",
		secondaryLabel: "Shop cycling",
		productLabel: "Running tee",
	},
	railTitles: {
		featured: "Featured",
		new: "New arrivals",
		sale: "Sale",
		running: "Running",
		cycling: "Cycling",
		triathlon: "Triathlon",
	},
	railMore: {
		new: "View all",
		sale: "View sale",
		running: "Shop running",
		cycling: "Shop cycling",
		triathlon: "Shop triathlon",
	},
	tabCategories: {
		running: "Running",
		cycling: "Cycling",
		triathlon: "Triathlon",
		training: "Training",
	},
	spotlight: {
		eyebrow: "Cycling",
		specs: [
			{ label: "Sport", value: "Cycling" },
			{ label: "Layer", value: "Windproof" },
		],
	},
	look: {
		eyebrow: "Running",
		heading: "Shop the kit",
		ctaLabel: "Shop the kit",
		listHeading: "In this look",
	},
	activity: {
		running: "Running",
		cycling: "Cycling",
		triathlon: "Triathlon",
	},
	faq: [
		{
			question: "How long does delivery take?",
			answer: ["Usually 2–3 business days within Poland."],
		},
		{
			question: "Can I return a product?",
			answer: ["Yes — you have 30 days to return without giving a reason."],
		},
	],
	marquee: "TRAIN HARD — GO FAR",
};

const pl: HomeLocaleCopy = {
	hero: {
		eyebrow: "Triathlon · Bieganie · Kolarstwo · Trening",
		heading: "CIĘŻKO TRENUJ. PEŁNĄ PARĄ.",
		voltText: "NA.",
		blackText: "MAX.",
		ctaLabel: "Nowości",
		secondaryLabel: "Kupuj kolarstwo",
		productLabel: "Koszulka do biegania",
	},
	railTitles: {
		featured: "Wyróżnione",
		new: "Nowości",
		sale: "Wyprzedaż",
		running: "Bieganie",
		cycling: "Kolarstwo",
		triathlon: "Triathlon",
	},
	railMore: {
		new: "Zobacz wszystkie",
		sale: "Zobacz wyprzedaż",
		running: "Kupuj bieganie",
		cycling: "Kupuj kolarstwo",
		triathlon: "Kupuj triathlon",
	},
	tabCategories: {
		running: "Bieganie",
		cycling: "Kolarstwo",
		triathlon: "Triathlon",
		training: "Trening",
	},
	spotlight: {
		eyebrow: "Kolarstwo",
		specs: [
			{ label: "Sport", value: "Kolarstwo" },
			{ label: "Warstwa", value: "Wiatroszczelna" },
		],
	},
	look: {
		eyebrow: "Bieganie",
		heading: "Kup cały strój",
		ctaLabel: "Kup cały strój",
		listHeading: "W tym looku",
	},
	activity: {
		running: "Bieganie",
		cycling: "Kolarstwo",
		triathlon: "Triathlon",
	},
	faq: [
		{
			question: "Jak długo trwa dostawa?",
			answer: ["Standardowo 2–3 dni robocze na terenie Polski."],
		},
		{
			question: "Czy mogę zwrócić produkt?",
			answer: ["Tak — masz 30 dni na zwrot bez podawania przyczyny."],
		},
	],
	marquee: "NA MAXA — DO KOŃCA",
};

export const homeCopy: Record<Locale, HomeLocaleCopy> = { en, pl };

export const homeRailTitle = (locale: Locale, key: string): string => {
	const titles = homeCopy[locale].railTitles;
	if (key in titles) return titles[key as keyof HomeRailTitles];
	return key;
};
