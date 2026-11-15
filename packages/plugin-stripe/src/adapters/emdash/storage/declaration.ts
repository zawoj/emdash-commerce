import { STORAGE } from "../constants.js";

/**
 * The `storage` declaration handed to `definePlugin`: for every collection the fields its stores filter or
 * sort on. EmDash rejects a `where` / `orderBy` on an undeclared field in `query` and `count`
 * (`StorageQueryError`; `updateIf` guards are exempt), and it materialises these as expression indexes
 * before it lets a state-changing route run. The test suite runs every store against a fake that enforces
 * the same rule, so a query added without its index here fails a test instead of production.
 *
 * Collections addressed only by id (`record_index`, `inventory_levels`) declare no index.
 * No unique indexes: uniqueness is the document id (event id, entity key, cart id, reservation id),
 * which `compareAndSet(id, null, …)` enforces.
 */
export interface StorageCollectionDeclaration {
	indexes: Array<string | string[]>;
	uniqueIndexes?: Array<string | string[]>;
}

export const storageDeclaration = {
	[STORAGE.catalogLinks]: { indexes: ["providerId", "dueAt", "syncStatus"] },
	[STORAGE.carts]: { indexes: ["status", "expiresAt", "updatedAt"] },
	[STORAGE.checkoutSnapshots]: { indexes: ["sessionId"] },
	[STORAGE.inventory]: { indexes: [] },
	[STORAGE.reservations]: { indexes: [["status", "expiresAt"]] },
	[STORAGE.recordIndex]: { indexes: [] },
	[STORAGE.refunds]: { indexes: ["orderId", "createdAt"] },
	[STORAGE.webhookInbox]: { indexes: ["status", "dueAt", "receivedAt"] },
	[STORAGE.eventOutbox]: { indexes: ["dueAt", "deadCount", "createdAt"] },
	[STORAGE.rateLimits]: { indexes: ["expiresAt"] },
} as const satisfies Record<string, StorageCollectionDeclaration>;

type Mutable<T> = { -readonly [K in keyof T]: T[K] extends readonly (infer U)[] ? U[] : T[K] };

/** Mutable copy for `definePlugin` (its `PluginStorageConfig` takes plain arrays). */
export const mutableStorageDeclaration = (): { [K in keyof typeof storageDeclaration]: Mutable<(typeof storageDeclaration)[K]> } =>
	structuredClone(storageDeclaration) as never;
