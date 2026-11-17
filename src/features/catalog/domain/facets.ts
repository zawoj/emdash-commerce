import type { ProductCardView } from "@emdash-commerce/plugin-stripe/contracts";

import { FILTER_GROUPS, SIZE_ORDER, type FilterGroupId } from "./constants";
import { parsePriceRange, type ListingState } from "./params";

/**
 * What the listing filters on, per product: the page embeds this as JSON so a script can count the
 * matches of a filter state in the browser, with the same function the server uses.
 */
export interface ItemFacet {
	slug: string;
	categories: string[];
	brand: string | null;
	/** Sizes that can be bought now. */
	sizes: string[];
	/** The price in minor units (the lowest one for a range). */
	price: number;
	isInStock: boolean;
}

const SOLD_OUT = "sold_out";

export const toFacet = (item: ProductCardView): ItemFacet => ({
	slug: item.slug,
	categories: item.categories.map((category) => category.slug),
	brand: item.brand?.slug ?? null,
	sizes: item.sizes.filter((size) => size.isAvailable).map((size) => size.label),
	price: item.price.amount,
	isInStock: item.availability.state !== SOLD_OUT,
});

const isInPriceRange = (price: number, state: ListingState): boolean =>
	(state.priceMin === null || price >= state.priceMin) && (state.priceMax === null || price <= state.priceMax);

/** A facet passes when it satisfies every group; inside a multi-select group (brands, sizes) any chosen value is enough. */
export const matchesListing = (facet: ItemFacet, state: ListingState): boolean => {
	if (state.category && !facet.categories.includes(state.category)) return false;
	if (state.inStock && !facet.isInStock) return false;
	if (state.brands.length > 0 && (facet.brand === null || !state.brands.includes(facet.brand))) return false;
	if (state.sizes.length > 0 && !state.sizes.some((size) => facet.sizes.includes(size))) return false;
	return isInPriceRange(facet.price, state);
};

export const countMatching = (facets: readonly ItemFacet[], state: ListingState): number =>
	facets.filter((facet) => matchesListing(facet, state)).length;

/**
 * The state as if one option of a group were chosen on its own: what that option alone would leave, next to
 * everything else already applied. `value` is the brand or size slug, a `min-max` price range (empty for any
 * price) or anything for the stock switch.
 */
export const withOption = (state: ListingState, group: FilterGroupId, value: string): ListingState => {
	switch (group) {
		case FILTER_GROUPS.inStock:
			return { ...state, inStock: true };
		case FILTER_GROUPS.brand:
			return { ...state, brands: [value] };
		case FILTER_GROUPS.size:
			return { ...state, sizes: [value] };
		case FILTER_GROUPS.price: {
			const range = parsePriceRange(value);
			return { ...state, priceMin: range?.min ?? null, priceMax: range?.max ?? null };
		}
	}
};

/** How many results an option leaves, next to the other filters that are applied. */
export const countOption = (
	facets: readonly ItemFacet[],
	state: ListingState,
	group: FilterGroupId,
	value: string,
): number => countMatching(facets, withOption(state, group, value));

const sizeRank = (size: string): number => {
	const index = (SIZE_ORDER as readonly string[]).indexOf(size.toUpperCase());
	return index === -1 ? SIZE_ORDER.length : index;
};

/** Every size that can be bought, the usual ones in size order and the rest after them as the catalog lists them. */
export const sizesOf = (facets: readonly ItemFacet[]): string[] => {
	const seen = [...new Set(facets.flatMap((facet) => facet.sizes))];
	return seen
		.map((size, index) => ({ size, index }))
		.sort((a, b) => sizeRank(a.size) - sizeRank(b.size) || a.index - b.index)
		.map((entry) => entry.size);
};

/** JSON that is safe inside a `<script type="application/json">` (a `<` can never close the tag). */
export const serializeFacets = (facets: readonly ItemFacet[]): string =>
	JSON.stringify(facets).replace(/</g, "\\u003c");

/** Reads what `serializeFacets` wrote; anything malformed is an empty list, never a throw. */
export const parseFacets = (json: string | null | undefined): ItemFacet[] => {
	if (!json) return [];
	try {
		const value: unknown = JSON.parse(json);
		return Array.isArray(value) ? (value as ItemFacet[]) : [];
	} catch {
		return [];
	}
};
