import {
	CATALOG_SORT,
	FILTER_GROUPS,
	LISTING_PARAMS,
	MAX_FILTER_VALUES,
	MAX_FILTER_VALUE_LENGTH,
	type CatalogSort,
	type FilterGroupId,
} from "./constants";

export interface ListingState {
	sort: CatalogSort;
	/** The category picked in the category bar (one at a time). */
	category: string | null;
	brands: string[];
	sizes: string[];
	inStock: boolean;
	/** Price bounds in minor units, both inclusive; `null` is open. */
	priceMin: number | null;
	priceMax: number | null;
}

export const emptyListing = (): ListingState => ({
	sort: CATALOG_SORT.newest,
	category: null,
	brands: [],
	sizes: [],
	inStock: false,
	priceMin: null,
	priceMax: null,
});

const PRICE_RANGE_PATTERN = /^(\d{0,9})-(\d{0,9})$/;

const parseMinor = (value: string | null): number | null => {
	if (!value) return null;
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

export interface PriceRange {
	min: number | null;
	max: number | null;
}

/** `2500-4999`, `-2499` and `10000-` are ranges; a bare `-` and anything else is not. */
export const parsePriceRange = (value: string | null): PriceRange | null => {
	const match = value ? PRICE_RANGE_PATTERN.exec(value.trim()) : null;
	if (!match) return null;
	const min = parseMinor(match[1] || null);
	const max = parseMinor(match[2] || null);
	if (min === null && max === null) return null;
	return { min: min === 0 ? null : min, max };
};

/** The `price` parameter value of a range ("" when both ends are open). */
export const priceRangeValue = (min: number | null, max: number | null): string =>
	min === null && max === null ? "" : `${min ?? ""}-${max ?? ""}`;

/** Repeated parameter values: trimmed, bounded, without duplicates. */
const readAll = (params: URLSearchParams, name: string): string[] => {
	const values = params
		.getAll(name)
		.map((value) => value.trim())
		.filter((value) => value.length > 0 && value.length <= MAX_FILTER_VALUE_LENGTH);
	return [...new Set(values)].slice(0, MAX_FILTER_VALUES);
};

/** Reads the listing state of a URL; the legacy `priceMin` / `priceMax` pair still works when there is no `price`. */
export const parseListing = (params: URLSearchParams): ListingState => {
	const sort = params.get(LISTING_PARAMS.sort);
	const sortValue =
		sort && (Object.values(CATALOG_SORT) as string[]).includes(sort)
			? (sort as CatalogSort)
			: CATALOG_SORT.newest;
	const range =
		parsePriceRange(params.get(LISTING_PARAMS.price)) ?? {
			min: parseMinor(params.get(LISTING_PARAMS.priceMin)),
			max: parseMinor(params.get(LISTING_PARAMS.priceMax)),
		};
	const category = params.get(LISTING_PARAMS.category)?.trim() ?? "";
	return {
		sort: sortValue,
		category: category.length > 0 && category.length <= MAX_FILTER_VALUE_LENGTH ? category : null,
		brands: readAll(params, LISTING_PARAMS.brand),
		sizes: readAll(params, LISTING_PARAMS.size),
		inStock: params.get(LISTING_PARAMS.inStock) === "1",
		priceMin: range.min === 0 ? null : range.min,
		priceMax: range.max,
	};
};

/** The canonical query of a state: defaults are left out, the legacy price pair becomes `price`. */
export const listingQuery = (state: ListingState): string => {
	const params = new URLSearchParams();
	if (state.category) params.set(LISTING_PARAMS.category, state.category);
	if (state.sort !== CATALOG_SORT.newest) params.set(LISTING_PARAMS.sort, state.sort);
	for (const brand of state.brands) params.append(LISTING_PARAMS.brand, brand);
	for (const size of state.sizes) params.append(LISTING_PARAMS.size, size);
	if (state.inStock) params.set(LISTING_PARAMS.inStock, "1");
	const price = priceRangeValue(state.priceMin, state.priceMax);
	if (price) params.set(LISTING_PARAMS.price, price);
	return params.toString();
};

export const listingHref = (basePath: string, state: ListingState): string => {
	const query = listingQuery(state);
	return query ? `${basePath}?${query}` : basePath;
};

/** The state without one applied filter (a chip's remove link). `value` names the brand or size; the others take none. */
export const withoutFilter = (state: ListingState, group: FilterGroupId, value?: string): ListingState => {
	switch (group) {
		case FILTER_GROUPS.inStock:
			return { ...state, inStock: false };
		case FILTER_GROUPS.price:
			return { ...state, priceMin: null, priceMax: null };
		case FILTER_GROUPS.brand:
			return { ...state, brands: state.brands.filter((brand) => brand !== value) };
		case FILTER_GROUPS.size:
			return { ...state, sizes: state.sizes.filter((size) => size !== value) };
	}
};

/** Drops every filter but keeps where the shopper is (the category) and how the list is ordered. */
export const withoutFilters = (state: ListingState): ListingState => ({
	...emptyListing(),
	sort: state.sort,
	category: state.category,
});

/** How many filters of the panel are applied (the category is not one of them: it sits in the category bar). */
export const appliedFilterCount = (state: ListingState): number =>
	(state.inStock ? 1 : 0) +
	state.sizes.length +
	state.brands.length +
	(state.priceMin !== null || state.priceMax !== null ? 1 : 0);
