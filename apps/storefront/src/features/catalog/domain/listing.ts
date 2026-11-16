import type {
	ActiveFilter,
	CategoryBarProps,
	FilterGroup,
	FilterOption,
	ListingFiltersProps,
	ListingToolbarProps,
} from "@emdash-commerce/design-system";
import type { ProductCardView } from "@emdash-commerce/plugin-stripe/contracts";

import type { Locale } from "../../../lib/i18n";
import { format, pluralize } from "../../../lib/strings";
import type { CatalogCopy } from "../copy";
import {
	CATALOG_SORT,
	CATEGORIES_ID,
	FILTER_GROUPS,
	FILTERS_ID,
	LISTING_PARAMS,
	type FilterGroupId,
} from "./constants";
import { countMatching, countOption, sizesOf, type ItemFacet } from "./facets";
import {
	appliedFilterCount,
	emptyListing,
	listingHref,
	priceRangeValue,
	withoutFilter,
	withoutFilters,
	type ListingState,
} from "./params";
import { isPreset, priceRangeLabel, pricePresets } from "./price-presets";

export interface NamedEntry {
	slug: string;
	name: string;
}

export interface ListingContext {
	locale: Locale;
	copy: CatalogCopy;
	/** What the URL asks for. */
	state: ListingState;
	basePath: string;
	/** Every product of the listing (before any filter): the options and their counts come from these. */
	facets: readonly ItemFacet[];
	brands: readonly NamedEntry[];
	categories: readonly (NamedEntry & { count: number })[];
}

/** The categories the products belong to, most populated first; a category with no product never appears. */
export const categoriesOf = (items: readonly ProductCardView[]): ListingContext["categories"] => {
	const found = new Map<string, NamedEntry & { count: number }>();
	for (const item of items) {
		for (const category of item.categories) {
			const entry = found.get(category.slug) ?? { ...category, count: 0 };
			found.set(category.slug, { ...entry, count: entry.count + 1 });
		}
	}
	return [...found.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
};

/**
 * A category in the URL that no product belongs to (a stale bookmark, a typo) counts as no category: the shopper sees
 * the whole shop instead of an empty page whose "Clear all filters" keeps the same category and goes nowhere.
 */
export const withKnownCategory = (state: ListingState, categories: readonly NamedEntry[]): ListingState =>
	state.category !== null && !categories.some((category) => category.slug === state.category)
		? { ...state, category: null }
		: state;

export const brandsOf = (items: readonly ProductCardView[]): NamedEntry[] => [
	...new Map(items.flatMap((item) => (item.brand ? [[item.brand.slug, item.brand] as const] : []))).values(),
];

const sortOptions = (copy: CatalogCopy) => [
	{ value: CATALOG_SORT.newest, label: copy.sortNewest },
	{ value: CATALOG_SORT.priceAsc, label: copy.sortPriceAsc },
	{ value: CATALOG_SORT.priceDesc, label: copy.sortPriceDesc },
	{ value: CATALOG_SORT.name, label: copy.sortName },
];

const nameOf = (entries: readonly NamedEntry[], slug: string): string =>
	entries.find((entry) => entry.slug === slug)?.name ?? slug;

const hrefWithout = (ctx: ListingContext, group: FilterGroupId, value?: string): string =>
	listingHref(ctx.basePath, withoutFilter(ctx.state, group, value));

const chipOf = (ctx: ListingContext, label: string, group: FilterGroupId, value?: string): ActiveFilter => ({
	label,
	removeHref: hrefWithout(ctx, group, value),
	removeLabel: format(ctx.copy.removeFilter, { filter: label }),
});

/** The applied filters of the panel as chips, each linking to the listing without it. */
export const activeFiltersOf = (ctx: ListingContext): ActiveFilter[] => {
	const { state, copy } = ctx;
	const hasPrice = state.priceMin !== null || state.priceMax !== null;
	return [
		...(state.inStock ? [chipOf(ctx, copy.filterInStock, FILTER_GROUPS.inStock)] : []),
		...state.sizes.map((size) => chipOf(ctx, format(copy.filterSizeChip, { size }), FILTER_GROUPS.size, size)),
		...state.brands.map((brand) => chipOf(ctx, nameOf(ctx.brands, brand), FILTER_GROUPS.brand, brand)),
		...(hasPrice
			? [
					chipOf(
						ctx,
						priceRangeLabel({ min: state.priceMin, max: state.priceMax }, ctx.locale, copy),
						FILTER_GROUPS.price,
					),
				]
			: []),
	];
};

export const clearAllLink = (ctx: ListingContext) => ({
	label: ctx.copy.filtersClearAll,
	href: listingHref(ctx.basePath, withoutFilters(ctx.state)),
});

/** Every query parameter of the state except the ones named, grouped by name (a brand repeats). */
const queryEntries = (state: ListingState, except: readonly string[]): Record<string, string | string[]> => {
	const entries: Record<string, string | string[]> = {};
	for (const [name, value] of new URLSearchParams(listingHref("", state).slice(1))) {
		if (except.includes(name)) continue;
		const current = entries[name];
		entries[name] = current === undefined ? value : [...(Array.isArray(current) ? current : [current]), value];
	}
	return entries;
};

export const toolbarProps = (ctx: ListingContext): ListingToolbarProps => ({
	action: ctx.basePath,
	sort: {
		id: "shop-sort",
		label: ctx.copy.sortLabel,
		name: LISTING_PARAMS.sort,
		options: sortOptions(ctx.copy),
		value: ctx.state.sort,
		submitLabel: ctx.copy.sortLabel,
	},
	keep: queryEntries(ctx.state, [LISTING_PARAMS.sort]),
	filters: {
		label: ctx.copy.filtersTitle,
		controls: FILTERS_ID,
		activeCount: appliedFilterCount(ctx.state),
		activeCountLabel: ctx.copy.filtersApplied,
	},
	activeFilters: activeFiltersOf(ctx),
	activeFiltersLabel: ctx.copy.activeFiltersLabel,
	clearAll: clearAllLink(ctx),
});

/** "All" plus one pill per category; the current one is the state's category. Other filters and the sort carry over. */
export const categoryBarProps = (ctx: ListingContext): CategoryBarProps => ({
	id: CATEGORIES_ID,
	label: ctx.copy.categoriesLabel,
	items: [
		{
			label: ctx.copy.categoryAll,
			href: listingHref(ctx.basePath, { ...ctx.state, category: null }),
			isCurrent: ctx.state.category === null,
		},
		...ctx.categories.map((category) => ({
			label: category.name,
			href: listingHref(ctx.basePath, { ...ctx.state, category: category.slug }),
			isCurrent: ctx.state.category === category.slug,
		})),
	],
});

/** A shopper's way back into the catalogue from an empty result: each category with the filters dropped. */
export const startFromCategoryLinks = (ctx: ListingContext) =>
	ctx.categories.map((category) => ({
		label: category.name,
		href: listingHref(ctx.basePath, { ...emptyListing(), sort: ctx.state.sort, category: category.slug }),
	}));

/** The button's text per plural category, each with `{count}`; the script picks one as the count changes. */
export const resultsForms = (copy: CatalogCopy): Record<string, string> => ({
	one: copy.filtersShowOne,
	few: copy.filtersShowFew,
	many: copy.filtersShowMany,
	other: copy.filtersShow,
	zero: copy.filtersShowNone,
});

export const resultsLabel = (ctx: ListingContext, total: number): string =>
	total === 0
		? ctx.copy.filtersShowNone
		: pluralize(ctx.locale, total, {
				one: ctx.copy.filtersShowOne,
				few: ctx.copy.filtersShowFew,
				many: ctx.copy.filtersShowMany,
				other: ctx.copy.filtersShow,
			});

export const countLabel = (ctx: ListingContext, total: number): string =>
	pluralize(ctx.locale, total, {
		one: ctx.copy.productCountOne,
		few: ctx.copy.productCountFew,
		many: ctx.copy.productCountMany,
		other: ctx.copy.productCount,
	});

const optionOf = (
	ctx: ListingContext,
	group: FilterGroupId,
	value: string,
	label: string,
	isChecked: boolean,
): FilterOption => ({
	value,
	label,
	isChecked,
	count: countOption(ctx.facets, ctx.state, group, value),
});

const priceGroup = (ctx: ListingContext): FilterGroup => {
	const { state, copy } = ctx;
	const hasRange = state.priceMin !== null || state.priceMax !== null;
	const current = priceRangeValue(state.priceMin, state.priceMax);
	const isCustom = hasRange && !isPreset(state.priceMin, state.priceMax);
	const presets = pricePresets().map((preset) =>
		optionOf(ctx, FILTER_GROUPS.price, preset.value, priceRangeLabel(preset, ctx.locale, copy), preset.value === current),
	);
	return {
		kind: "segmented",
		id: "filter-price",
		name: LISTING_PARAMS.price,
		label: copy.filterPrice,
		options: [
			{
				value: "",
				label: copy.priceAny,
				isChecked: !hasRange,
				count: countMatching(ctx.facets, { ...state, priceMin: null, priceMax: null }),
			},
			...presets,
			// A range from an old link has no preset: it shows as its own choice so applying keeps it.
			...(isCustom
				? [optionOf(ctx, FILTER_GROUPS.price, current, priceRangeLabel({ min: state.priceMin, max: state.priceMax }, ctx.locale, copy), true)]
				: []),
		],
	};
};

export const filtersProps = (ctx: ListingContext, total: number): ListingFiltersProps => {
	const { state, copy } = ctx;
	const sizes = sizesOf(ctx.facets);
	return {
		id: FILTERS_ID,
		action: ctx.basePath,
		title: copy.filtersTitle,
		closeLabel: copy.filtersClose,
		countLabel: copy.filterCountLabel,
		groups: [
			{
				kind: "switch",
				id: "filter-stock",
				name: LISTING_PARAMS.inStock,
				label: copy.filterAvailability,
				option: optionOf(ctx, FILTER_GROUPS.inStock, "1", copy.filterInStock, state.inStock),
			},
			...(sizes.length > 0
				? [
						{
							kind: "chips" as const,
							id: "filter-size",
							name: LISTING_PARAMS.size,
							label: copy.filterSize,
							options: sizes.map((size) => optionOf(ctx, FILTER_GROUPS.size, size, size, state.sizes.includes(size))),
						},
					]
				: []),
			...(ctx.brands.length > 0
				? [
						{
							kind: "checkbox" as const,
							id: "filter-brand",
							name: LISTING_PARAMS.brand,
							label: copy.filterBrand,
							options: ctx.brands.map((brand) =>
								optionOf(ctx, FILTER_GROUPS.brand, brand.slug, brand.name, state.brands.includes(brand.slug)),
							),
						},
					]
				: []),
			priceGroup(ctx),
		],
		keep: {
			...(state.category ? { [LISTING_PARAMS.category]: state.category } : {}),
			...(state.sort !== CATALOG_SORT.newest ? { [LISTING_PARAMS.sort]: state.sort } : {}),
		},
		clearAll: clearAllLink(ctx),
		results: { label: resultsLabel(ctx, total), forms: resultsForms(copy) },
	};
};
