import { CATALOG_SORT, LISTING_PARAMS, type CatalogSort } from "./constants";

export interface ListingState {
	sort: CatalogSort;
	brand: string | null;
	inStock: boolean;
	priceMin: number | null;
	priceMax: number | null;
}

export const emptyListing = (): ListingState => ({
	sort: CATALOG_SORT.newest,
	brand: null,
	inStock: false,
	priceMin: null,
	priceMax: null,
});

const parseMinor = (value: string | null): number | null => {
	if (!value) return null;
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

export const parseListing = (params: URLSearchParams): ListingState => {
	const sort = params.get(LISTING_PARAMS.sort);
	const sortValue =
		sort && (Object.values(CATALOG_SORT) as string[]).includes(sort)
			? (sort as CatalogSort)
			: CATALOG_SORT.newest;
	return {
		sort: sortValue,
		brand: params.get(LISTING_PARAMS.brand)?.trim() || null,
		inStock: params.get(LISTING_PARAMS.inStock) === "1",
		priceMin: parseMinor(params.get(LISTING_PARAMS.priceMin)),
		priceMax: parseMinor(params.get(LISTING_PARAMS.priceMax)),
	};
};

export const listingQuery = (state: ListingState): string => {
	const params = new URLSearchParams();
	if (state.sort !== CATALOG_SORT.newest) params.set(LISTING_PARAMS.sort, state.sort);
	if (state.brand) params.set(LISTING_PARAMS.brand, state.brand);
	if (state.inStock) params.set(LISTING_PARAMS.inStock, "1");
	if (state.priceMin !== null) params.set(LISTING_PARAMS.priceMin, String(state.priceMin));
	if (state.priceMax !== null) params.set(LISTING_PARAMS.priceMax, String(state.priceMax));
	return params.toString();
};
