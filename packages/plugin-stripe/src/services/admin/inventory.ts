import type { z } from "zod";

import type { adminCatalogResyncInput, adminInventoryAdjustInput, adminInventoryGetInput } from "../../contracts/api.js";
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
