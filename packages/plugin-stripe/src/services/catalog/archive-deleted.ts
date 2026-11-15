import type { CatalogProvider } from "../../ports/payment-provider.js";
import type { CatalogLinkStore, Clock } from "../../ports/repositories.js";
import { priceUpdateKey, productUpdateKey, strongHash } from "./idempotency.js";
import { beginWrite, markSynced, mutateLink } from "./link-mutate.js";

const DELETED_HASH = strongHash({ deleted: true });

/**
 * Archives the Stripe object of an entity that no longer exists in content. Only the catalog link is left, so the
 * write is `active: false` and nothing else; a second call (hook retry, cron) is a no-op once recorded.
 *
 * Never creates a link: an entity that has none was never synced. A link that never reached Stripe (no provider id:
 * the entity was inactive, or deleted before its first sync) has nothing to archive, but it is settled all the same,
 * otherwise it stays `pending`, due since the epoch, and cron revisits it forever.
 */
export const archiveDeletedEntity = async (
	catalog: CatalogProvider,
	store: CatalogLinkStore,
	clock: Clock,
	entityKey: string,
	kind: "product" | "price",
): Promise<void> => {
	const link = (await store.get(entityKey))?.value;
	if (!link) return;
	if (!link.providerId) {
		await mutateLink(store, entityKey, (current) =>
			current.syncStatus === "synced" && current.lastWrittenHash === DELETED_HASH
				? null
				: { ...current, syncStatus: "synced", lastError: null, attempts: 0, nextAttemptAt: null, driftFields: [], lastWrittenHash: DELETED_HASH, syncedAt: clock.now().toISOString() },
		);
		return;
	}
	if (link.syncStatus === "synced" && link.lastWrittenHash === DELETED_HASH) return;
	const version = await beginWrite(store, entityKey, DELETED_HASH);
	if (kind === "product") {
		await catalog.archiveProduct(link.providerId, productUpdateKey(entityKey, version, { archive: true }));
	} else {
		const patch = { isActive: false };
		await catalog.updatePrice(link.providerId, patch, priceUpdateKey(link.providerId, version, patch));
	}
	await markSynced(store, clock, entityKey, {
		providerId: link.providerId,
		fingerprint: link.fingerprint,
		lastWrittenHash: DELETED_HASH,
		lastWritten: { ...link.lastWritten, isActive: false },
	});
};
