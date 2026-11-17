import type { z } from "zod";

import type { adminCatalogResyncInput, adminCatalogSyncInput, adminInventoryAdjustInput, adminInventoryGetInput } from "../../contracts/api.js";
import type { SellableRef } from "../../core/catalog.js";
import type { Reservation } from "../../core/inventory.js";
import { createCatalogSyncService } from "../catalog-sync.js";
import { createInventoryService, type StockView } from "../inventory.js";
import type { AdminContext } from "./context.js";

/** Past every real expiry: lists all held reservations (the store filters by an upper bound only). */
const FAR_FUTURE = "9999-12-31T23:59:59.999Z";
const HELD_SCAN_LIMIT = 100;

export interface InventoryDetail {
	stock: StockView;
	/** Stock holds of open checkouts that include this sellable, oldest expiry first. */
	heldReservations: Array<Pick<Reservation, "id" | "cartId" | "expiresAt" | "createdAt"> & { quantity: number }>;
}

const sameSellable = (a: SellableRef, b: SellableRef): boolean => a.kind === b.kind && a.id === b.id;

export const getInventory = async ({ container, publisher }: AdminContext, input: z.infer<typeof adminInventoryGetInput>): Promise<InventoryDetail> => {
	const sellable: SellableRef = { kind: input.kind, id: input.id };
	const [stock, held] = await Promise.all([
		createInventoryService(container, { publisher }).get(sellable),
		container.inventory.listExpiredReservations(FAR_FUTURE, HELD_SCAN_LIMIT),
	]);
	const heldReservations = held.flatMap((reservation) => {
		const quantity = reservation.lines.filter((line) => sameSellable(line.sellable, sellable)).reduce((sum, line) => sum + line.quantity, 0);
		return quantity > 0 ? [{ id: reservation.id, cartId: reservation.cartId, expiresAt: reservation.expiresAt, createdAt: reservation.createdAt, quantity }] : [];
	});
	return { stock, heldReservations };
};

/** The editor path for stock: product-level stock (no variants) has no content field, so it is changed only here. */
export const adjustInventory = ({ container, publisher }: AdminContext, input: z.infer<typeof adminInventoryAdjustInput>): Promise<StockView> =>
	createInventoryService(container, { publisher }).adjust(input);

export const resyncCatalog = async ({ container, publisher }: AdminContext, input: z.infer<typeof adminCatalogResyncInput>): Promise<{ queued: number }> =>
	createCatalogSyncService(container, publisher).resync(input.productId ?? null);

/** More links than this are reported as `MAX_PROGRESS_SCAN` (a progress figure, not an exact count). */
const MAX_PROGRESS_SCAN = 500;

export interface CatalogSyncProgress {
	/** Links synced in this call. */
	processed: number;
	/** Links still due (`isCapped`: at least this many). */
	due: number;
	/** Links whose last attempt failed; they retry with backoff. */
	failed: number;
	isCapped: boolean;
}

/** Syncs a batch of due links now and reports what is left, so a caller can drive a resync to the end by repeating it. */
export const syncCatalogNow = async ({ container, publisher }: AdminContext, input: z.infer<typeof adminCatalogSyncInput>): Promise<CatalogSyncProgress> => {
	const processed = await createCatalogSyncService(container, publisher).processDue(input.limit);
	const [due, failed] = await Promise.all([
		container.catalogLinks.listDue(container.clock.now().toISOString(), MAX_PROGRESS_SCAN + 1),
		container.catalogLinks.listFailed(MAX_PROGRESS_SCAN + 1),
	]);
	return { processed, due: Math.min(due.length, MAX_PROGRESS_SCAN), failed: Math.min(failed.length, MAX_PROGRESS_SCAN), isCapped: due.length > MAX_PROGRESS_SCAN };
};
