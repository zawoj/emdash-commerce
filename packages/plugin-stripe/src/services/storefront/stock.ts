import { sellableKey, type InventoryPolicy, type SellableRef } from "../../core/catalog.js";
import type { CommerceContainer } from "../../plugin/container.js";

/** Tracked stock of 1..LOW_STOCK_MAX units is shown as "low" (with the count); more reads as plain in stock. */
export const LOW_STOCK_MAX = 5;

export const STOCK_STATE = {
	inStock: "in_stock",
	low: "low",
	backorder: "backorder",
	soldOut: "sold_out",
} as const;
export type StockState = (typeof STOCK_STATE)[keyof typeof STOCK_STATE];

export interface Availability {
	state: StockState;
	/** 1..LOW_STOCK_MAX when `state` is low, else null. Exact counts are never published beyond that. */
	lowCount: number | null;
}

const IN_STOCK: Availability = { state: STOCK_STATE.inStock, lowCount: null };

/** Availability of one sellable: `available` is the units a buyer could still take, null when stock is not tracked. */
export const availabilityOf = (policy: InventoryPolicy, available: number | null): Availability => {
	if (!policy.isTracked || available === null) return IN_STOCK;
	if (available <= 0) return policy.allowsBackorder ? { state: STOCK_STATE.backorder, lowCount: null } : { state: STOCK_STATE.soldOut, lowCount: null };
	if (available <= LOW_STOCK_MAX) return { state: STOCK_STATE.low, lowCount: available };
	return IN_STOCK;
};

/**
 * Availability of a product over its active variants: in stock beats low beats backorder beats sold out. Low counts
 * add up; when they add up beyond the low threshold the product as a whole is plainly in stock.
 */
export const mergeAvailability = (parts: readonly Availability[]): Availability => {
	if (parts.some((part) => part.state === STOCK_STATE.inStock)) return IN_STOCK;
	const low = parts.filter((part) => part.state === STOCK_STATE.low);
	if (low.length > 0) {
		const total = low.reduce((sum, part) => sum + (part.lowCount ?? 0), 0);
		return total > LOW_STOCK_MAX ? IN_STOCK : { state: STOCK_STATE.low, lowCount: total };
	}
	if (parts.some((part) => part.state === STOCK_STATE.backorder)) return { state: STOCK_STATE.backorder, lowCount: null };
	return { state: STOCK_STATE.soldOut, lowCount: null };
};

export interface StockSubject {
	ref: SellableRef;
	policy: InventoryPolicy;
}

/** Availability per `sellableKey` in one inventory read; the policies come from the records the caller already loaded. */
export const loadAvailabilities = async (container: CommerceContainer, subjects: readonly StockSubject[]): Promise<Map<string, Availability>> => {
	if (subjects.length === 0) return new Map();
	const levels = await container.inventory.getMany(subjects.map((subject) => subject.ref));
	return new Map(
		subjects.map(({ ref, policy }) => {
			const key = sellableKey(ref);
			const available = policy.isTracked ? Math.max(0, levels.get(key)?.available ?? 0) : null;
			return [key, availabilityOf(policy, available)] as const;
		}),
	);
};
