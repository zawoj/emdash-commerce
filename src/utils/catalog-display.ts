import type { CatalogProductView } from "@emdash-commerce/plugin-stripe/contracts";
import type { ShopProductType } from "./shop-archive-controls";
import { SHOP_PRODUCT_TYPE, SHOP_SORT, type ShopArchiveSort } from "./shop-archive-controls";

const INTERVAL_LABELS: Record<string, string> = {
	day: "day",
	week: "week",
	month: "month",
	year: "year",
};

export const defaultCatalogPrice = (catalog: CatalogProductView) =>
	catalog.prices.find((price) => price.isDefault) ?? catalog.prices[0] ?? null;

export const formatCatalogUnitPrice = (
	amount: number,
	currency: string,
	type: "one_time" | "recurring",
	interval: string | null,
	intervalCount: number | null,
): string => {
	const formatted = new Intl.NumberFormat(undefined, {
		style: "currency",
		currency: currency.toUpperCase(),
	}).format(amount / 100);
	if (type !== "recurring") return formatted;
	const intervalKey = interval ?? "month";
	const intervalLabel = INTERVAL_LABELS[intervalKey] ?? intervalKey;
	const count = intervalCount ?? 1;
	if (count > 1) return `${formatted} / ${count} ${intervalLabel}s`;
	return `${formatted} / ${intervalLabel}`;
};

export const formatDefaultPriceLabel = (catalog: CatalogProductView): string => {
	const price = defaultCatalogPrice(catalog);
	if (!price) return "";
	return formatCatalogUnitPrice(
		price.unitAmount.amount,
		price.unitAmount.currency,
		price.type,
		price.interval,
		price.intervalCount,
	);
};

export const catalogMatchesProductType = (
	catalog: CatalogProductView,
	type: ShopProductType | null,
): boolean => {
	if (!type) return true;
	const price = defaultCatalogPrice(catalog);
	if (!price) return false;
	const catalogType = price.type === "recurring" ? SHOP_PRODUCT_TYPE.SUBSCRIPTION : SHOP_PRODUCT_TYPE.ONE_TIME;
	return catalogType === type;
};

export const defaultPriceAmount = (catalog: CatalogProductView): number => {
	const price = defaultCatalogPrice(catalog);
	return price?.unitAmount.amount ?? 0;
};

export interface ShopCatalogCard {
	slug: string;
	priceId: string;
	priceLabel: string;
	isPurchasable: boolean;
	sortPrice: number;
}

export const shopCatalogCardFromView = (catalog: CatalogProductView): ShopCatalogCard | null => {
	const price = defaultCatalogPrice(catalog);
	if (!price) return null;
	return {
		slug: catalog.slug,
		priceId: price.id,
		priceLabel: formatDefaultPriceLabel(catalog),
		isPurchasable: catalog.isAvailable && price.isPurchasable,
		sortPrice: price.unitAmount.amount,
	};
};

export const sortCatalogCards = <T extends { sortPrice: number; slug: string }>(
	items: T[],
	sort: ShopArchiveSort,
): T[] => {
	if (sort !== SHOP_SORT.PRICE_ASC && sort !== SHOP_SORT.PRICE_DESC) return items;
	const dir = sort === SHOP_SORT.PRICE_ASC ? 1 : -1;
	return [...items].sort((a, b) => {
		const byPrice = (a.sortPrice - b.sortPrice) * dir;
		return byPrice !== 0 ? byPrice : a.slug.localeCompare(b.slug);
	});
};
