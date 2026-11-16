import type { Locale } from "../../lib/i18n";
import type { HomeFaqItem } from "./config";

export interface HomeHeroCopy {
	eyebrow: string;
	heading: string;
	ctaLabel: string;
	secondaryLabel: string;
	productLabel: string;
	categoriesLabel: string;
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

/** The category pills under the hero; each key is a product category slug. */
export interface HomeCategoryCopy {
	readonly apparel: string;
	readonly desk: string;
	readonly drinkware: string;
	readonly stickers: string;
	readonly bundles: string;
	readonly sale: string;
}

/** The rails of the home page; each key is a rail key of the home structure. */
export interface HomeRailTitles {
	readonly new: string;
	readonly sale: string;
	readonly bundles: string;
}

export interface HomeLocaleCopy {
	hero: HomeHeroCopy;
	railTitles: HomeRailTitles;
	railMore: HomeRailTitles;
	spotlight: HomeSpotlightCopy;
	look: HomeLookCopy;
	activity: HomeCategoryCopy;
	faq: readonly HomeFaqItem[];
}

const en: HomeLocaleCopy = {
	hero: {
		eyebrow: "Unofficial mock merch store",
		heading: "Merch for people who ship at the edge.",
		ctaLabel: "Shop new arrivals",
		secondaryLabel: "Shop bundles",
		productLabel: "Workers tee",
		categoriesLabel: "Shop by category",
	},
	railTitles: {
		new: "New arrivals",
		sale: "Sale",
		bundles: "Bundles",
	},
	railMore: {
		new: "View all",
		sale: "View all",
		bundles: "View all",
	},
	spotlight: {
		eyebrow: "Outerwear",
		specs: [
			{ label: "Category", value: "Outerwear" },
			{ label: "Layer", value: "Windproof" },
		],
	},
	look: {
		eyebrow: "Desk setup",
		heading: "Shop the desk setup",
		ctaLabel: "Shop the desk setup",
		listHeading: "In this setup",
	},
	activity: {
		apparel: "Apparel",
		desk: "Desk setup",
		drinkware: "Drinkware",
		stickers: "Stickers",
		bundles: "Bundles",
		sale: "Sale",
	},
	faq: [
		{
			question: "Is this official Cloudflare merch?",
			answer: [
				"No. This is an unofficial demo storefront with fictional products and mock data, built to show what EmDash and Stripe can do. Nothing here ships.",
			],
		},
		{
			question: "How long does delivery take?",
			answer: ["In a real shop: 3–5 business days, tracked. Here, nothing is delivered — use a Stripe test card."],
		},
		{
			question: "Can I return a product?",
			answer: ["Yes — in a real shop you would have 30 days to return without giving a reason."],
		},
	],
};

const pl: HomeLocaleCopy = {
	hero: {
		eyebrow: "Nieoficjalny sklep z gadżetami",
		heading: "Gadżety dla ludzi, którzy wdrażają na edge'u.",
		ctaLabel: "Zobacz nowości",
		secondaryLabel: "Kupuj zestawy",
		productLabel: "Koszulka Workers",
		categoriesLabel: "Kupuj według kategorii",
	},
	railTitles: {
		new: "Nowości",
		sale: "Wyprzedaż",
		bundles: "Zestawy",
	},
	railMore: {
		new: "Zobacz wszystkie",
		sale: "Zobacz wszystkie",
		bundles: "Zobacz wszystkie",
	},
	spotlight: {
		eyebrow: "Okrycia wierzchnie",
		specs: [
			{ label: "Kategoria", value: "Okrycia wierzchnie" },
			{ label: "Warstwa", value: "Wiatroszczelna" },
		],
	},
	look: {
		eyebrow: "Biurko",
		heading: "Kup całe biurko",
		ctaLabel: "Kup całe biurko",
		listHeading: "W tym zestawie",
	},
	activity: {
		apparel: "Odzież",
		desk: "Biurko",
		drinkware: "Do picia",
		stickers: "Naklejki",
		bundles: "Zestawy",
		sale: "Wyprzedaż",
	},
	faq: [
		{
			question: "Czy to oficjalne gadżety Cloudflare?",
			answer: [
				"Nie. To nieoficjalny sklep demo z fikcyjnymi produktami i danymi testowymi, pokazujący możliwości EmDash i Stripe. Nic stąd nie jest wysyłane.",
			],
		},
		{
			question: "Jak długo trwa dostawa?",
			answer: ["W prawdziwym sklepie: 3–5 dni roboczych, z numerem śledzenia. Tutaj nic nie jest dostarczane — użyj karty testowej Stripe."],
		},
		{
			question: "Czy mogę zwrócić produkt?",
			answer: ["Tak — w prawdziwym sklepie masz 30 dni na zwrot bez podawania przyczyny."],
		},
	],
};

export const homeCopy: Record<Locale, HomeLocaleCopy> = { en, pl };

export const homeRailTitle = (locale: Locale, key: string): string => {
	const titles = homeCopy[locale].railTitles;
	if (key in titles) return titles[key as keyof HomeRailTitles];
	return key;
};
