import type { CatalogProductView } from "../contracts/api.js";

const INTERVAL_LABELS: Record<string, string> = {
	day: "day",
	week: "week",
	month: "month",
	year: "year",
};

export const defaultCatalogPrice = (catalog: CatalogProductView) =>
	catalog.prices.find((price) => price.isDefault) ?? catalog.prices[0] ?? null;

export const formatDefaultPriceLabel = (catalog: CatalogProductView): string => {
	const price = defaultCatalogPrice(catalog);
	if (!price) return "";
	const formatted = new Intl.NumberFormat(undefined, {
		style: "currency",
		currency: price.unitAmount.currency.toUpperCase(),
	}).format(price.unitAmount.amount / 100);
	if (price.type !== "recurring") return formatted;
	const interval = price.interval ?? "month";
	const intervalLabel = INTERVAL_LABELS[interval] ?? interval;
	const count = price.intervalCount ?? 1;
	if (count > 1) return `${formatted} / ${count} ${intervalLabel}s`;
	return `${formatted} / ${intervalLabel}`;
};
