export const STOCK_STATUSES = {
	inStock: "in_stock",
	low: "low",
	backorder: "backorder",
	soldOut: "sold_out",
} as const;

export type StockStatus = (typeof STOCK_STATUSES)[keyof typeof STOCK_STATUSES];

export const CATALOG_SORT = {
	newest: "newest",
	priceAsc: "price-asc",
	priceDesc: "price-desc",
	name: "name",
} as const;

export type CatalogSort = (typeof CATALOG_SORT)[keyof typeof CATALOG_SORT];

/** Query parameters of the shop listing. `priceMin` / `priceMax` (minor units) are the legacy range; `price` is `min-max`. */
export const LISTING_PARAMS = {
	sort: "sort",
	category: "category",
	brand: "brand",
	size: "size",
	inStock: "inStock",
	price: "price",
	priceMin: "priceMin",
	priceMax: "priceMax",
} as const;

/** The filter groups a shopper can change in the panel (the category is picked in the category bar). */
export const FILTER_GROUPS = {
	inStock: "inStock",
	size: "size",
	brand: "brand",
	price: "price",
} as const;

export type FilterGroupId = (typeof FILTER_GROUPS)[keyof typeof FILTER_GROUPS];

/** The most products the shop asks the catalog API for (its own maximum): a listing that reaches it is cut short. */
export const CATALOG_FETCH_LIMIT = 200;

/** Upper bounds on what one URL can ask for: a listing never needs more, a crafted URL must not grow the work. */
export const MAX_FILTER_VALUES = 24;
export const MAX_FILTER_VALUE_LENGTH = 64;

/** Preset price breaks in major units (25, 50, 100); the amounts of the catalog are minor units with two decimals. */
export const PRICE_PRESET_BREAKS = [25, 50, 100] as const;
export const MINOR_PER_MAJOR = 100;

/** Sizes shown in this order first; any other size follows in the order the catalog lists it. */
export const SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "3XL"] as const;

/** Element ids and data attributes the page and its client script agree on. */
export const FACETS_SCRIPT_ID = "shop-facets";
export const FILTERS_ID = "shop-filters";
export const CATEGORIES_ID = "shop-categories";

export const OPTION_FIELD_PREFIX = "option:";
export const MAX_QUANTITY = 99;
export const NEW_PRODUCT_DAYS = 30;
export const CARD_IMAGE_SIZES = "(min-width: 1100px) 22vw, (min-width: 640px) 33vw, 50vw";
export const EAGER_CARDS = 3;
export const RELATED_LIMIT = 8;
export const SIZE_ATTRIBUTE_PATTERN = /size|rozmiar/i;
export const IMAGE_AXIS_PATTERN = /colou?r|kolor/i;
