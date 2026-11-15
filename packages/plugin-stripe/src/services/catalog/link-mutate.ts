import { truncateError } from "../../ports/due.js";
import type { CatalogLastWritten, CatalogLink, CatalogLinkStore, Clock } from "../../ports/repositories.js";

export const emptyLink = (entityKey: string): CatalogLink => ({
	entityKey,
	providerId: null,
	providerPriceByFingerprint: {},
	fingerprint: null,
	syncStatus: "pending",
	lastError: null,
	attempts: 0,
	nextAttemptAt: null,
	syncedAt: null,
	driftFields: [],
	syncVersion: 0,
	lastWrittenHash: null,
	lastWritten: null,
});

export const syncVersionOf = (link: Pick<CatalogLink, "syncVersion">): number => link.syncVersion ?? 0;

/** Loads or seeds a link row. */
export const loadLink = async (store: CatalogLinkStore, entityKey: string): Promise<{ link: CatalogLink; revision: string | null }> => {
	const versioned = await store.get(entityKey);
	if (versioned) return { link: { ...versioned.value }, revision: versioned.revision };
	const link = emptyLink(entityKey);
	await store.put(link, null);
	const created = await store.get(entityKey);
	return { link: created?.value ?? link, revision: created?.revision ?? null };
};

/** CAS loop: applies `change` on the latest link until it succeeds or gives up. */
export const mutateLink = async (
	store: CatalogLinkStore,
	entityKey: string,
	change: (link: CatalogLink) => CatalogLink | null,
): Promise<CatalogLink | null> => {
	for (let attempt = 0; attempt < 8; attempt += 1) {
		const versioned = await store.get(entityKey);
		const current = versioned?.value ?? emptyLink(entityKey);
		const next = change({ ...current, providerPriceByFingerprint: { ...current.providerPriceByFingerprint } });
		if (!next) return current;
		const expected = versioned?.revision ?? null;
		const result = await store.put(next, expected);
		if (result.applied) return next;
	}
	return null;
};

/**
 * The desired state of the entity changed (a hook, a terms change, an admin resync): bumps the sync version
 * so the next provider write gets a key of its own. `force` forgets the last written hash so the next attempt
 * rewrites the provider object even when the payload is unchanged (admin resync repairing drift).
 */
export const markPending = async (store: CatalogLinkStore, entityKey: string, options: { force?: boolean } = {}): Promise<void> => {
	await mutateLink(store, entityKey, (link) => ({
		...link,
		syncStatus: "pending",
		nextAttemptAt: null,
		syncVersion: syncVersionOf(link) + 1,
		...(options.force ? { lastWrittenHash: null } : {}),
		...(link.syncStatus === "synced" && link.driftFields.length === 0 ? { lastError: null } : {}),
	}));
};

/**
 * Called before a provider write. A link that is still `synced` was not marked pending by anybody, yet the
 * payload is about to change (a checkout found a price whose variant was reactivated): that is a new intent,
 * so it gets a new version. Pending and failed links keep theirs, so a retry reuses the same key.
 */
export const beginWrite = async (store: CatalogLinkStore, entityKey: string, desiredHash: string): Promise<number> => {
	const result = await mutateLink(store, entityKey, (link) =>
		link.syncStatus === "synced" && link.lastWrittenHash !== desiredHash
			? { ...link, syncStatus: "pending", syncVersion: syncVersionOf(link) + 1 }
			: null,
	);
	if (!result) throw new Error(`Catalog link ${entityKey} is contended; the attempt will be retried`);
	return syncVersionOf(result);
};

export interface SyncedPatch {
	providerId: string | null;
	fingerprint: string | null;
	providerPriceByFingerprint?: Record<string, string>;
	lastWrittenHash: string;
	lastWritten: CatalogLastWritten;
}

/** Records a successful write: what was written (for the skip and the drift checks) and when, from the container clock. */
export const markSynced = async (store: CatalogLinkStore, clock: Clock, entityKey: string, patch: SyncedPatch): Promise<void> => {
	await mutateLink(store, entityKey, (link) => ({
		...link,
		...patch,
		providerPriceByFingerprint: patch.providerPriceByFingerprint ?? link.providerPriceByFingerprint,
		syncStatus: "synced",
		lastError: null,
		attempts: 0,
		nextAttemptAt: null,
		driftFields: [],
		syncedAt: clock.now().toISOString(),
	}));
};

export const markFailed = async (
	store: CatalogLinkStore,
	entityKey: string,
	error: string,
	attempts: number,
	nextAttemptAt: string,
): Promise<void> => {
	await mutateLink(store, entityKey, (link) => ({
		...link,
		syncStatus: "failed",
		lastError: truncateError(error),
		attempts,
		nextAttemptAt,
	}));
};
