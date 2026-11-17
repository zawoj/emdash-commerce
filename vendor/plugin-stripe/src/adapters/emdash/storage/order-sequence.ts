import type { KVAccess } from "emdash";

import { KV_KEY } from "../constants.js";
import { withSerializationRetry } from "./cas.js";

const MAX_ATTEMPTS = 200;

export class OrderSequenceContentionError extends Error {
	constructor(year: number, attempts: number) {
		super(`The order number counter of ${year} kept changing under concurrent writers (${attempts} attempts)`);
		this.name = "OrderSequenceContentionError";
	}
}

/**
 * Hands out the next order sequence number of a year: read the counter with its revision, write `value + 1` with
 * `compareAndSet(expectedRevision)` and retry when another writer got there first. A null revision creates the
 * counter only when absent, so two first orders of a year cannot both get 1. Every value is returned to exactly one
 * caller; a caller that dies before creating its order leaves a gap, never a duplicate.
 */
export const allocateOrderSequence = async (kv: Pick<KVAccess, "getVersioned" | "compareAndSet">, year: number): Promise<number> => {
	const key = KV_KEY.orderSequence(year);
	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
		const current = await withSerializationRetry(() => kv.getVersioned<number>(key));
		const next = (typeof current?.value === "number" && Number.isInteger(current.value) ? current.value : 0) + 1;
		const written = await withSerializationRetry(() => kv.compareAndSet(key, current?.revision ?? null, next));
		if (written.applied) return next;
	}
	throw new OrderSequenceContentionError(year, MAX_ATTEMPTS);
};
