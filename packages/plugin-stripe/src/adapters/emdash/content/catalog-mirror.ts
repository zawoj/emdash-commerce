import type { CommerceOptions } from "../../../contracts/options.js";
import { INVENTORY_ADJUSTMENT_REASON } from "../../../core/inventory.js";
import type { InventoryStore, Logger } from "../../../ports/repositories.js";
import { PRICE_FIELD, VARIANT_FIELD } from "../schema/field-names.js";
import type { WritableContent } from "./repositories.js";

export type SyncMirrorStatus = "pending" | "synced" | "failed";

export interface CatalogMirror {
	writeVariantSync(
		variantId: string,
		fields: { stripeProductId: string | null; stripeSyncStatus: SyncMirrorStatus; stripeSyncError: string | null },
	): Promise<void>;
	writePriceSync(
		priceId: string,
		fields: { stripePriceId: string | null; stripeSyncStatus: SyncMirrorStatus; stripeSyncError: string | null },
	): Promise<void>;
	writeVariantStock(variantId: string, onHand: number): Promise<void>;
	/** Sets a price entry's `is_active` (a price of a deleted variant must not stay sellable). Best effort. */
	writePriceActive(priceId: string, isActive: boolean): Promise<void>;
}

/**
 * The content-side mirror of catalog state, owned by the container. It writes variants and prices only (their
 * Stripe ids, sync status and the editor stock field); a product has no Stripe mirror field and is never
 * written. Content `update` fires no hooks, so a mirror write never re-enters catalog sync.
 */
export const createCatalogMirror = (
	content: WritableContent,
	slugs: CommerceOptions["collections"],
	inventory: InventoryStore,
	log: Logger,
): CatalogMirror => ({
	async writeVariantSync(variantId, fields) {
		try {
			await content.update(slugs.variants, variantId, {
				[VARIANT_FIELD.stripeProductId]: fields.stripeProductId ?? "",
				[VARIANT_FIELD.stripeSyncStatus]: fields.stripeSyncStatus,
				[VARIANT_FIELD.stripeSyncError]: fields.stripeSyncError ?? "",
			});
		} catch (error) {
			log.warn("Could not write variant Stripe mirror", { variantId, error: error instanceof Error ? error.message : "unknown" });
		}
	},
	async writePriceSync(priceId, fields) {
		try {
			await content.update(slugs.prices, priceId, {
				[PRICE_FIELD.stripePriceId]: fields.stripePriceId ?? "",
				[PRICE_FIELD.stripeSyncStatus]: fields.stripeSyncStatus,
				[PRICE_FIELD.stripeSyncError]: fields.stripeSyncError ?? "",
			});
		} catch (error) {
			log.warn("Could not write price Stripe mirror", { priceId, error: error instanceof Error ? error.message : "unknown" });
		}
	},
	async writePriceActive(priceId, isActive) {
		try {
			await content.update(slugs.prices, priceId, { [PRICE_FIELD.isActive]: isActive });
		} catch (error) {
			log.warn("Could not write price active flag", { priceId, error: error instanceof Error ? error.message : "unknown" });
		}
	},
	async writeVariantStock(variantId, onHand) {
		await content.update(slugs.variants, variantId, { [VARIANT_FIELD.stock]: onHand });
		const level = await inventory.get({ kind: "variant", id: variantId });
		if (!level) {
			await inventory.adjust({ kind: "variant", id: variantId }, onHand, INVENTORY_ADJUSTMENT_REASON.editorEdit);
		}
		await inventory.setMirroredOnHand({ kind: "variant", id: variantId }, onHand);
	},
});

/** Keeps the editor stock field aligned with inventory storage after a sale, a refund restock or an admin adjustment. */
export const writeVariantStockMirror = (container: { catalogMirror: CatalogMirror }, variantId: string, onHand: number): Promise<void> =>
	container.catalogMirror.writeVariantStock(variantId, onHand);
