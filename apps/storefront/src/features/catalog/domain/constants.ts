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

export const LISTING_PARAMS = {
	sort: "sort",
	brand: "brand",
	inStock: "inStock",
	priceMin: "priceMin",
	priceMax: "priceMax",
} as const;

export const OPTION_FIELD_PREFIX = "option:";
export const MAX_QUANTITY = 99;
export const NEW_PRODUCT_DAYS = 30;
export const CARD_IMAGE_SIZES = "(min-width: 1100px) 22vw, (min-width: 640px) 33vw, 50vw";
export const EAGER_CARDS = 3;
export const RELATED_LIMIT = 8;
export const SIZE_ATTRIBUTE_PATTERN = /size|rozmiar/i;
export const IMAGE_AXIS_PATTERN = /colou?r|kolor/i;
