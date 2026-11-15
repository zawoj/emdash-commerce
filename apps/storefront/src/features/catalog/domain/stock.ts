import type { ProductCardView } from "@emdash-commerce/plugin-stripe/contracts";

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
