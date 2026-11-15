import type { ListingFiltersProps, ListingToolbarProps } from "@emdash-commerce/design-system";

import type { Locale } from "../../../lib/i18n";
import { format } from "../../../lib/strings";
import type { CatalogCopy } from "../copy";
import { CATALOG_SORT, LISTING_PARAMS } from "./constants";
import type { ListingState } from "./params";

export const FILTERS_ID = "shop-filters";

export interface ListingContext {
	locale: Locale;
	copy: CatalogCopy;
	state: ListingState;
	basePath: string;
	brands: readonly { slug: string; name: string }[];
}

const sortOptions = (copy: CatalogCopy) => [
	{ value: CATALOG_SORT.newest, label: copy.sortNewest },
	{ value: CATALOG_SORT.priceAsc, label: copy.sortPriceAsc },
	{ value: CATALOG_SORT.priceDesc, label: copy.sortPriceDesc },
	{ value: CATALOG_SORT.name, label: copy.sortName },
];

export const toolbarProps = (ctx: ListingContext, total: number): ListingToolbarProps => ({
	resultCount: format(ctx.copy.productCount, { count: total }),
	action: ctx.basePath,
	sort: {
		id: "shop-sort",
		label: ctx.copy.sortLabel,
		name: LISTING_PARAMS.sort,
		options: sortOptions(ctx.copy),
		value: ctx.state.sort,
		submitLabel: ctx.copy.sortLabel,
	},
	keep: Object.fromEntries(
		[
			ctx.state.brand ? [LISTING_PARAMS.brand, ctx.state.brand] : null,
			ctx.state.inStock ? [LISTING_PARAMS.inStock, "1"] : null,
			ctx.state.priceMin !== null ? [LISTING_PARAMS.priceMin, String(ctx.state.priceMin)] : null,
			ctx.state.priceMax !== null ? [LISTING_PARAMS.priceMax, String(ctx.state.priceMax)] : null,
		].filter((entry): entry is [string, string] => entry !== null),
	),
	filterToggle: { label: ctx.copy.filtersTitle, href: `#${FILTERS_ID}` },
});

export const filtersProps = (ctx: ListingContext): ListingFiltersProps => ({
	id: FILTERS_ID,
	action: ctx.basePath,
	title: ctx.copy.filtersTitle,
	submitLabel: ctx.copy.filtersApply,
	groups: [
		{
			id: "availability",
			kind: "checkbox",
			label: ctx.copy.filterAvailability,
			name: LISTING_PARAMS.inStock,
			options: [
				{ value: "1", label: ctx.copy.filterInStock, isChecked: ctx.state.inStock },
			],
		},
		...(ctx.brands.length > 0
			? [
					{
						id: "brand",
						kind: "checkbox" as const,
						label: ctx.copy.filterBrand,
						name: LISTING_PARAMS.brand,
						options: ctx.brands.map((brand) => ({
							value: brand.slug,
							label: brand.name,
							isChecked: ctx.state.brand === brand.slug,
						})),
					},
				]
			: []),
		{
			id: "price",
			kind: "range",
			label: ctx.copy.filterPrice,
			min: {
				name: LISTING_PARAMS.priceMin,
				label: ctx.copy.filterPriceFrom,
				value: ctx.state.priceMin ?? undefined,
			},
			max: {
				name: LISTING_PARAMS.priceMax,
				label: ctx.copy.filterPriceTo,
				value: ctx.state.priceMax ?? undefined,
			},
			unit: "zł",
		},
	],
	keep: { [LISTING_PARAMS.sort]: ctx.state.sort },
});
