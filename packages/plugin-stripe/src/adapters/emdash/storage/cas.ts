import type { StorageCollection } from "emdash";

/**
 * `updateIf` aborts with `StorageSerializationError` when it loses a race on Postgres above READ
 * COMMITTED, or on a deadlock. The losing write is never applied, so a bounded retry is safe. Matched
 * by shape (not `instanceof`) because the class can be duplicated across SSR chunks, the same way
 * EmDash matches its own errors.
 */
export const isSerializationError = (error: unknown): boolean =>
	error instanceof Error && (error.name === "StorageSerializationError" || (error as { code?: unknown }).code === "STORAGE_SERIALIZATION_FAILURE");

export const DEFAULT_RETRY_ATTEMPTS = 6;

export const withSerializationRetry = async <T>(run: () => Promise<T>, attempts = DEFAULT_RETRY_ATTEMPTS): Promise<T> => {
	for (let attempt = 1; ; attempt += 1) {
		try {
			return await run();
		} catch (error) {
			if (!isSerializationError(error) || attempt >= attempts) throw error;
		}
	}
};

export class CasConflictError extends Error {
	constructor(id: string, attempts: number) {
		super(`Storage record ${id} kept changing under concurrent writers (${attempts} attempts)`);
		this.name = "CasConflictError";
	}
}

/**
 * Read-modify-write on one document with revision compare-and-set. `change` returns the next value, or
 * null to leave the document as it is. Returns the stored value after the call, or null when absent.
 */
export const updateWithCas = async <T>(
	collection: StorageCollection<T>,
	id: string,
	change: (current: T) => T | null,
	maxAttempts = 25,
): Promise<T | null> => {
	for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
		const current = await withSerializationRetry(() => collection.getVersioned(id));
		if (!current) return null;
		const next = change(structuredClone(current.value));
		if (next === null) return current.value;
		const result = await withSerializationRetry(() => collection.compareAndSet(id, current.revision, next));
		if (result.applied) return next;
	}
	throw new CasConflictError(id, maxAttempts);
};

export const MAX_QUERY_LIMIT = 100;

/** Reads every page of a query (bounded) — for small per-owner lists such as refunds of one order. */
export const queryAll = async <T>(
	collection: StorageCollection<T>,
	options: NonNullable<Parameters<StorageCollection<T>["query"]>[0]>,
	maxItems = 500,
): Promise<T[]> => {
	const items: T[] = [];
	let cursor: string | undefined;
	do {
		const page = await collection.query({ ...options, limit: MAX_QUERY_LIMIT, cursor });
		items.push(...page.items.map((item) => item.data));
		cursor = page.hasMore ? page.cursor : undefined;
	} while (cursor && items.length < maxItems);
	return items;
};
