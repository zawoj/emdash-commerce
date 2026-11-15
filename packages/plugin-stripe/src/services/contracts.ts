import type { ExtensionContext } from "../contracts/extensions.js";
import type { AnyCommerceEvent } from "../core/events.js";
import type { ProviderPriceSnapshot, ProviderProductSnapshot } from "../ports/payment-provider.js";

/**
 * Interfaces between services built by different phase-2 owners. Each implementation lives in the file
 * named on it and is constructed from a `CommerceContainer` (plugin/container.ts):
 *
 *   createEventPublisher(container)      services/outbox.ts            (2C)
 *   createExtensionContext(container)    services/extension-context.ts (2C)
 *   createCatalogSyncService(container, publisher) services/catalog-sync.ts (2A)
 */

/** Writes domain events to the outbox and delivers them; see core/events.ts for the guarantees. */
export interface EventPublisher {
	/**
	 * Enqueues the events (idempotent on event id) for every registered subscriber, then attempts
	 * delivery inline. Never throws because a subscriber failed: failures stay in the outbox for cron.
	 */
	publish(events: readonly AnyCommerceEvent[]): Promise<void>;
	/** Cron: delivers due retries. Returns the number of deliveries attempted. */
	processDue(limit: number): Promise<number>;
	/** Manual retry of a dead event (admin, MCP). */
	retry(eventId: string): Promise<void>;
}

export type CatalogEntityRef = { entity: "product" | "variant" | "price"; id: string };

export interface CatalogSyncService {
	/**
	 * Marks the entity (and what depends on it: a product's variants and prices) for sync and attempts
	 * it now. Failures are recorded on the catalog link (retried by `processDue`) and published as
	 * `catalog.sync_failed`; this method does not throw for provider failures.
	 */
	syncEntity(ref: CatalogEntityRef): Promise<void>;
	/**
	 * For checkout: returns, per price id, the provider price id for the price's CURRENT terms, syncing
	 * synchronously what is missing. A null value means the price cannot be sold right now.
	 * Throws `ProviderError` only when the provider is unreachable (checkout must fail with 502).
	 */
	ensurePricesSynced(priceIds: readonly string[]): Promise<Map<string, string | null>>;
	/** Archives the product's Stripe products and prices (unpublish, delete). */
	deactivateProduct(productId: string): Promise<void>;
	/**
	 * `content:afterDelete`: the entity is gone from content, so it is archived in Stripe from its catalog link alone
	 * (a product also archives the variants and prices that still reference it).
	 */
	archiveDeleted(ref: CatalogEntityRef): Promise<void>;
	/**
	 * `content:beforeDelete`: the one moment the entity's dependents can still be listed (a trashed variant's prices, a
	 * trashed product's variants are unreadable afterwards). Marks their existing catalog links pending, so the
	 * `afterDelete` pass and cron settle each of them by link (`processDue`).
	 */
	prepareDelete(ref: CatalogEntityRef): Promise<void>;
	/** Webhook `product_changed` / `price_changed`: records drift, never writes content from Stripe. */
	handleProviderProductChanged(snapshot: ProviderProductSnapshot): Promise<void>;
	handleProviderPriceChanged(snapshot: ProviderPriceSnapshot): Promise<void>;
	/** Cron: retries due pending/failed links. Returns the number processed. */
	processDue(limit: number): Promise<number>;
	/** Admin: queues every entity of one product, or of the whole catalog. */
	resync(productId: string | null): Promise<{ queued: number }>;
}

export type { ExtensionContext };
