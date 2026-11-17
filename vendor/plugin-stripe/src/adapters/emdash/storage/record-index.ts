import type { StorageCollection } from "emdash";

import type { Clock, RecordIndex } from "../../../ports/repositories.js";

/** A claim that never got a record id (the claiming worker died) can be taken over after this long. */
export const CLAIM_STALE_MS = 5 * 60 * 1000;

export interface IndexEntry {
	recordId: string | null;
	claimedAt: string;
}

/**
 * Secondary keys the content API cannot query. `claim` is the exactly-once gate: the winner is the one
 * whose `compareAndSet(key, null, …)` is applied; everyone else sees the winner's record id (or null while
 * the winner is still working).
 */
export const createRecordIndex = (collection: StorageCollection<IndexEntry>, clock: Clock): RecordIndex => {
	const fresh = (): IndexEntry => ({ recordId: null, claimedAt: clock.now().toISOString() });
	const claim: RecordIndex["claim"] = async (key) => {
		const created = await collection.compareAndSet(key, null, fresh());
		if (created.applied) return { isWinner: true };
		const existing = await collection.getVersioned(key);
		// The entry vanished between the two calls (a released claim): try to claim again.
		if (!existing) return claim(key);
		if (existing.value.recordId) return { isWinner: false, recordId: existing.value.recordId };
		const age = clock.now().getTime() - new Date(existing.value.claimedAt).getTime();
		if (age <= CLAIM_STALE_MS) return { isWinner: false, recordId: null };
		const takeover = await collection.compareAndSet(key, existing.revision, fresh());
		if (takeover.applied) return { isWinner: true };
		return { isWinner: false, recordId: (await collection.get(key))?.recordId ?? null };
	};
	return {
		async get(key) {
			return (await collection.get(key))?.recordId ?? null;
		},
		claim,
		async set(key, recordId) {
			await collection.put(key, { recordId, claimedAt: clock.now().toISOString() });
		},
		async releaseClaim(key) {
			const existing = await collection.getVersioned(key);
			// Only an unfinished claim is released; a completed one (record id set) stays.
			if (existing && existing.value.recordId === null) await collection.compareAndDelete(key, existing.revision);
		},
	};
};
