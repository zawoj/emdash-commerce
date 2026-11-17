import type { SellableRef } from "./catalog.js";

/**
 * Stock lives in plugin storage, not in content, because only storage has atomic guarded updates
 * (`updateIf` with a `gte` guard). The content field an editor sees is a mirror.
 *
 * Invariant per sellable: `available = onHand - reserved` (may be negative only via backorder or an
 * admin lowering `onHand` below what is already reserved).
 *
 * Reservation lifecycle: held (checkout session created) → committed (order paid: onHand and
 * reserved both drop) | released (session expired, payment failed, cart changed: reserved drops,
 * available rises). Each transition is idempotent on the reservation record's state.
 */

export interface StockLevel {
	sellable: SellableRef;
	onHand: number;
	reserved: number;
	available: number;
	/** The `onHand` last written to the content mirror, used to turn an editor's edit into a delta. */
	mirroredOnHand: number;
	updatedAt: string;
}

export const RESERVATION_STATUS = {
	held: "held",
	committed: "committed",
	released: "released",
} as const;
export type ReservationStatus = (typeof RESERVATION_STATUS)[keyof typeof RESERVATION_STATUS];

export interface ReservationLine {
	sellable: SellableRef;
	quantity: number;
}

export interface Reservation {
	id: string;
	cartId: string;
	checkoutSessionId: string | null;
	lines: ReservationLine[];
	status: ReservationStatus;
	expiresAt: string;
	createdAt: string;
	updatedAt: string;
}

export type ReserveResult =
	| { ok: true; reservation: Reservation }
	| { ok: false; shortfalls: Array<{ sellable: SellableRef; requested: number; available: number }> };

export const INVENTORY_ADJUSTMENT_REASON = {
	editorEdit: "editor_edit",
	adminAdjust: "admin_adjust",
	sale: "sale",
	refundRestock: "refund_restock",
	migration: "migration",
} as const;
export type InventoryAdjustmentReason =
	(typeof INVENTORY_ADJUSTMENT_REASON)[keyof typeof INVENTORY_ADJUSTMENT_REASON];
