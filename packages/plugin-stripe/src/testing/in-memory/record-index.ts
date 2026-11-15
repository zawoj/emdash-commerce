import type { Clock, RecordIndex } from "../../ports/repositories.js";
import { VersionedMap } from "./runtime.js";

/** A claim that never got a record id (crashed worker) can be taken over after this long. */
export const CLAIM_STALE_MS = 5 * 60 * 1000;

interface IndexEntry {
	recordId: string | null;
	claimedAt: string;
}

export const createInMemoryRecordIndex = (clock: Clock): RecordIndex & { keys(): string[] } => {
	const rows = new VersionedMap<IndexEntry>();
	const fresh = (): IndexEntry => ({ recordId: null, claimedAt: clock.now().toISOString() });
	const claim: RecordIndex["claim"] = async (key) => {
			const created = await rows.put(key, fresh(), null);
			if (created.applied) return { isWinner: true };
			const existing = await rows.get(key);
			if (!existing) return claim(key);
			const { recordId, claimedAt } = existing.value;
			if (recordId) return { isWinner: false, recordId };
			const isStale = clock.now().getTime() - new Date(claimedAt).getTime() > CLAIM_STALE_MS;
			if (!isStale) return { isWinner: false, recordId: null };
			const takeover = await rows.put(key, fresh(), existing.revision);
			return takeover.applied ? { isWinner: true } : { isWinner: false, recordId: (await rows.get(key))?.value.recordId ?? null };
	};
	return {
		keys: () => rows.all().map((row) => row.id),
		async get(key) {
			return (await rows.get(key))?.value.recordId ?? null;
		},
		claim,
		async set(key, recordId) {
			await rows.set(key, { recordId, claimedAt: clock.now().toISOString() });
		},
		async releaseClaim(key) {
			const existing = await rows.get(key);
			if (existing && existing.value.recordId === null) await rows.delete(key);
		},
	};
};
