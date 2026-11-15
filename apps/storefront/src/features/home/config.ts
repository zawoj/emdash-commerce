/** Typed storefront home composition; slugs and media are locale-agnostic. */

export interface HomeRailConfig {
	key: string;
	title: string;
	category?: string;
	sort?: "newest" | "price-asc" | "price-desc" | "name";
	limit?: number;
	moreHref?: string;
	moreLabel?: string;
	tabCategorySlugs?: readonly string[];
}

export interface HomeSpotlightConfig {
	productSlug: string;
	imageUrl: string;
	imageAlt: string;
	eyebrow: string;
	heading?: string;
	specs: readonly { label: string; value: string }[];
}

/** The look image and its points come from the `home` entry (`look_hotspots`), not from here. */
export interface HomeLookConfig {
	eyebrow: string;
	heading: string;
	note?: string;
	ctaLabel: string;
}

export interface HomeFaqItem {
	question: string;
	answer: readonly string[];
}

export interface HomeConfig {
	hero: {
		eyebrow: string;
		heading: string;
		voltText: string;
		blackText: string;
		imageUrl: string;
		imageAlt: string;
		ctaHref: string;
		ctaLabel: string;
		secondaryHref: string;
		secondaryLabel: string;
		productSlug: string;
		productLabel: string;
	};
	rails: readonly HomeRailConfig[];
	spotlight: HomeSpotlightConfig;
	look: HomeLookConfig;
	activityCategories: readonly { slug: string; name: string; imageUrl: string; href: string }[];
	faq: readonly HomeFaqItem[];
	newsletterAction: string;
}

/** Demo default photos: Unsplash photo ids, so a fresh database needs no media-library keys. Replace with your own. */
const unsplash = (photoId: string): string => `https://images.unsplash.com/photo-${photoId}?w=1600&q=80&fm=jpg`;

/** Locale-neutral home structure (copy merged in `loadHomeConfig`). */
export const homeStructure = {
	hero: {
		imageUrl: unsplash("1552674605-db6ffd4facb5"),
		imageAlt: "Runners on an open road",
		ctaHref: "/shop?category=new-arrivals",
		secondaryHref: "/shop?category=cycling",
		productSlug: "aero-run-tee",
	},
	rails: [
		{ key: "featured", category: undefined, sort: "newest" as const, limit: 8 },
		{
			key: "new",
			category: "new-arrivals",
			sort: "newest" as const,
			limit: 12,
			moreHref: "/shop?category=new-arrivals",
			tabCategorySlugs: ["running", "cycling", "triathlon", "training"],
		},
		{
			key: "sale",
			category: "sale",
			limit: 12,
			moreHref: "/shop?category=sale",
		},
		{ key: "running", category: "running", limit: 12, moreHref: "/shop?category=running" },
		{ key: "cycling", category: "cycling", limit: 12, moreHref: "/shop?category=cycling" },
		{ key: "triathlon", category: "triathlon", limit: 12, moreHref: "/shop?category=triathlon" },
	],
	spotlight: {
		productSlug: "velocity-shell",
		imageUrl: unsplash("1541625602330-2277a4c46182"),
		imageAlt: "Two cyclists on a coastal road",
	},
	activityCategories: [
		{
			slug: "running",
			imageUrl: unsplash("1552674605-db6ffd4facb5"),
			href: "/shop?category=running",
		},
		{
			slug: "cycling",
			imageUrl: unsplash("1541625602330-2277a4c46182"),
			href: "/shop?category=cycling",
		},
		{
			slug: "triathlon",
			imageUrl: unsplash("1606903037631-f09fd0bd74b4"),
			href: "/shop?category=triathlon",
		},
	],
	newsletterAction: "/api/newsletter",
} as const;

/** @deprecated Use `loadHomeConfig(locale)` — kept for type re-exports only. */
export const defaultHomeConfig = (): HomeConfig => {
	throw new Error("defaultHomeConfig is deprecated; call loadHomeConfig(locale)");
};
