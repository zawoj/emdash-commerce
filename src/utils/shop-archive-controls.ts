import {
	ARCHIVE_VIEW,
	archiveHrefFromDefaults,
	parseArchiveView,
	resultCountLabel,
	type ArchiveView,
} from "./archive-controls-shared";

/** Product billing filter; omitted from the URL means all types. */
export const SHOP_PRODUCT_TYPE = {
	ONE_TIME: "one_time",
	SUBSCRIPTION: "subscription",
} as const;

export type ShopProductType =
	(typeof SHOP_PRODUCT_TYPE)[keyof typeof SHOP_PRODUCT_TYPE];

export const SHOP_SORT = {
	NEWEST: "newest",
	OLDEST: "oldest",
	PRICE_ASC: "price-asc",
	PRICE_DESC: "price-desc",
	TITLE_ASC: "title-asc",
	TITLE_DESC: "title-desc",
} as const;

export type ShopArchiveSort = (typeof SHOP_SORT)[keyof typeof SHOP_SORT];

export const SHOP_SORT_LABELS: Record<ShopArchiveSort, string> = {
	[SHOP_SORT.NEWEST]: "Newest first",
	[SHOP_SORT.OLDEST]: "Oldest first",
	[SHOP_SORT.PRICE_ASC]: "Price low to high",
	[SHOP_SORT.PRICE_DESC]: "Price high to low",
	[SHOP_SORT.TITLE_ASC]: "Name A–Z",
	[SHOP_SORT.TITLE_DESC]: "Name Z–A",
};

export interface ShopArchiveControls {
	sort: ShopArchiveSort;
	view: ArchiveView;
	/** `one_time` or `subscription`, or null for all. */
	type: ShopProductType | null;
}

export const SHOP_DEFAULT_CONTROLS: ShopArchiveControls = {
	sort: SHOP_SORT.NEWEST,
	view: ARCHIVE_VIEW.LIST,
	type: null,
};

const SORT_VALUES = new Set<string>(Object.values(SHOP_SORT));
const TYPE_VALUES = new Set<string>(Object.values(SHOP_PRODUCT_TYPE));

const isSort = (value: string | null): value is ShopArchiveSort =>
	value !== null && SORT_VALUES.has(value);

const isType = (value: string | null): value is ShopProductType =>
	value !== null && TYPE_VALUES.has(value);

export const parseShopArchiveControls = (
	params: URLSearchParams,
): ShopArchiveControls => {
	const sortParam = params.get("sort");
	const typeParam = params.get("type");
	return {
		sort: isSort(sortParam) ? sortParam : SHOP_DEFAULT_CONTROLS.sort,
		view: parseArchiveView(params.get("view"), SHOP_DEFAULT_CONTROLS.view),
		type: isType(typeParam) ? typeParam : null,
	};
};

export const isPriceSort = (sort: ShopArchiveSort): boolean =>
	sort === SHOP_SORT.PRICE_ASC || sort === SHOP_SORT.PRICE_DESC;

export const shopOrderByFor = (
	sort: ShopArchiveSort,
): Record<string, "asc" | "desc"> => {
	if (sort === SHOP_SORT.OLDEST) return { published_at: "asc" };
	if (isPriceSort(sort)) return { published_at: "desc" };
	if (sort === SHOP_SORT.TITLE_ASC) return { title: "asc" };
	if (sort === SHOP_SORT.TITLE_DESC) return { title: "desc" };
	return { published_at: "desc" };
};

/** Product type filtering uses the catalog default price (`catalog-display`); CMS has no billing column. */
export const shopWhereFor = (_controls: ShopArchiveControls): Record<string, string> => ({});

export const isShopFiltered = (controls: ShopArchiveControls): boolean =>
	controls.type !== null;

export const isShopCustomised = (controls: ShopArchiveControls): boolean =>
	isShopFiltered(controls) ||
	controls.sort !== SHOP_DEFAULT_CONTROLS.sort ||
	controls.view !== SHOP_DEFAULT_CONTROLS.view;

export const shopArchiveHrefValues = (
	controls: ShopArchiveControls,
): Record<string, string | null | undefined> => ({
	type: controls.type,
	sort: controls.sort,
	view: controls.view,
});

export const shopArchiveDefaults = (): Record<string, string> => ({
	type: "",
	sort: SHOP_DEFAULT_CONTROLS.sort,
	view: SHOP_DEFAULT_CONTROLS.view,
});

export const shopArchiveHref = (
	basePath: string,
	controls: ShopArchiveControls,
	options: { cursor?: string } = {},
): string =>
	archiveHrefFromDefaults(
		basePath,
		shopArchiveHrefValues(controls),
		shopArchiveDefaults(),
		options,
	);

export const shopResultLabel = (count: number, hasMore: boolean): string =>
	resultCountLabel(count, hasMore, { one: "product", other: "products" });

const INTERVAL_LABELS: Record<string, string> = {
	day: "day",
	week: "week",
	month: "month",
	year: "year",
};

/** Price in minor units, with subscription interval suffix when relevant. */
export const formatProductPrice = (product: {
	price: number;
	currency: string;
	billing_type: "one_time" | "subscription";
	interval?: string;
	interval_count?: number;
}): string => {
	const currency = product.currency.toUpperCase();
	const formatted = new Intl.NumberFormat(undefined, {
		style: "currency",
		currency,
	}).format(product.price / 100);

	if (product.billing_type !== "subscription") return formatted;

	const interval = product.interval ?? "month";
	const intervalLabel = INTERVAL_LABELS[interval] ?? interval;
	const count = product.interval_count ?? 1;
	if (count > 1) {
		return `${formatted} / ${count} ${intervalLabel}s`;
	}
	return `${formatted} / ${intervalLabel}`;
};
