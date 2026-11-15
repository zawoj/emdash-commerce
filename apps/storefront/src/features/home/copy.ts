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

/** The home categories shown as rails, tabs and the index; each key is a product category slug. */
export interface HomeCategoryCopy {
	readonly apparel: string;
	readonly desk: string;
	readonly drinkware: string;
	readonly bundles: string;
}

export interface HomeRailTitles extends HomeCategoryCopy {
	readonly featured: string;
	readonly new: string;
	readonly sale: string;
}

export interface HomeLocaleCopy {
	hero: HomeHeroCopy;
	railTitles: HomeRailTitles;
	railMore: HomeCategoryCopy & {
		readonly new: string;
		readonly sale: string;
	};
	tabCategories: HomeCategoryCopy;
	spotlight: HomeSpotlightCopy;
	look: HomeLookCopy;
	activity: HomeCategoryCopy;
	faq: readonly HomeFaqItem[];
	marquee: string;
}

const en: HomeLocaleCopy = {
	hero: {
		eyebrow: "Apparel · Desk setup · Drinkware · Bundles",
		heading: "MERCH FOR PEOPLE WHO SHIP AT THE EDGE.",
		voltText: "SHIP.",
		blackText: "AT THE\nEDGE",
		ctaLabel: "New arrivals",
		secondaryLabel: "Shop bundles",
		productLabel: "Workers tee",
	},
	railTitles: {
		featured: "Featured",
		new: "New arrivals",
		sale: "Sale",
		bundles: "Bundles",
		apparel: "Apparel",
		desk: "Desk setup",
		drinkware: "Drinkware",
	},
	railMore: {
		new: "View all",
		sale: "View sale",
		bundles: "Shop bundles",
		apparel: "Shop apparel",
		desk: "Shop desk setup",
		drinkware: "Shop drinkware",
	},
	tabCategories: {
		apparel: "Apparel",
		desk: "Desk setup",
		drinkware: "Drinkware",
		bundles: "Bundles",
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
		bundles: "Bundles",
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
	marquee: "SHIP IT AT THE EDGE",
};

const pl: HomeLocaleCopy = {
	hero: {
		eyebrow: "Odzież · Biurko · Akcesoria do picia · Zestawy",
		heading: "GADŻETY DLA LUDZI, KTÓRZY WDRAŻAJĄ NA EDGE'U.",
		voltText: "WDRAŻAJ.",
		blackText: "NA\nEDGE'U",
		ctaLabel: "Nowości",
		secondaryLabel: "Kupuj zestawy",
		productLabel: "Koszulka Workers",
	},
	railTitles: {
		featured: "Wyróżnione",
		new: "Nowości",
		sale: "Wyprzedaż",
		bundles: "Zestawy",
		apparel: "Odzież",
		desk: "Biurko",
		drinkware: "Do picia",
	},
	railMore: {
		new: "Zobacz wszystkie",
		sale: "Zobacz wyprzedaż",
		bundles: "Kupuj zestawy",
		apparel: "Kupuj odzież",
		desk: "Kupuj na biurko",
		drinkware: "Kupuj do picia",
	},
	tabCategories: {
		apparel: "Odzież",
		desk: "Biurko",
		drinkware: "Do picia",
		bundles: "Zestawy",
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
		bundles: "Zestawy",
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
	marquee: "WDRAŻAJ NA EDGE'U",
};

export const homeCopy: Record<Locale, HomeLocaleCopy> = { en, pl };

export const homeRailTitle = (locale: Locale, key: string): string => {
	const titles = homeCopy[locale].railTitles;
	if (key in titles) return titles[key as keyof HomeRailTitles];
	return key;
};
