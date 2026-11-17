import type { ProductCardView } from "@emdash-commerce/plugin-stripe/contracts";

import type { Locale } from "../../../lib/i18n";
import { pluralize } from "../../../lib/strings";
import type { CatalogCopy } from "../copy";
import { STOCK_STATUSES, type StockStatus } from "./constants";

export interface StockInfo {
	status: StockStatus;
	lowCount: number | null;
}

type Availability = ProductCardView["availability"];

export const stockOfAvailability = (availability: Availability): StockInfo => ({
	status: availability.state,
	lowCount: availability.lowCount,
});

export const isPurchasable = (availability: Availability): boolean =>
	availability.state !== STOCK_STATUSES.soldOut;

/** "Last item" / "Last 3 items": the low-stock text in the plural form of the count (`lowCount` unknown counts as one). */
export const stockLowLabel = (locale: Locale, copy: CatalogCopy, count: number | null): string =>
	pluralize(locale, count ?? 1, {
		one: copy.stockLowOne,
		few: copy.stockLowFew,
		many: copy.stockLowMany,
		other: copy.stockLow,
	});
