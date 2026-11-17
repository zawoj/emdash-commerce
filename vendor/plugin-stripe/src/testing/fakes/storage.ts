import type {
	ConditionalDeleteResult,
	ConditionalWriteResult,
	KVAccess,
	PaginatedResult,
	StorageCollection,
	UpdateIfArgs,
	UpdateIfResult,
	VersionedValue,
} from "emdash";

type QueryOptions = NonNullable<Parameters<StorageCollection["query"]>[0]>;
type WhereClause = NonNullable<QueryOptions["where"]>;

/**
 * A fake of EmDash's `StorageCollection` that enforces the rules production enforces
 * (verified in `emdash/src/database/repositories/plugin-storage.ts` and `plugins/storage-query.ts`):
 *
 * - `query` / `count` accept only declared-index fields in `where` and `orderBy`; `limit` clamps to 1-100;
 * - `compareAndSet` with a null revision creates only when absent, otherwise the revision must match;
 * - `updateIf` never inserts, evaluates its guard and numeric deltas in one step, does NOT clamp,
 *   and its `where` may use any field (no index requirement);
 * - a unique index rejects a second document with the same value;
 * - a stored value is a JSON round trip, so callers cannot mutate stored state by reference.
 *
 * `failNext` injects a `StorageSerializationError`-shaped abort to exercise retry loops.
 */

export class FakeStorageSerializationError extends Error {
	readonly code = "STORAGE_SERIALIZATION_FAILURE";
	readonly retryable = true;
	constructor() {
		super("Storage write must be retried");
		this.name = "StorageSerializationError";
	}
}

export class FakeStorageQueryError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "StorageQueryError";
	}
}

interface Row<T> {
	data: T;
	revision: number;
	createdAt: number;
	seq: number;
}

const MAX_KEY_LENGTH = 1024;
const MAX_VALUE_BYTES = 1024 * 1024;

const json = <T>(value: T): T => {
	const serialized = JSON.stringify(value);
	if (serialized === undefined) throw new TypeError("Storage value must be JSON serializable");
	return JSON.parse(serialized) as T;
};

const assertKey = (key: unknown): void => {
	if (typeof key !== "string" || key.length === 0 || key.length > MAX_KEY_LENGTH) {
		throw new TypeError(`Storage key must be a nonempty string of at most ${MAX_KEY_LENGTH} characters`);
	}
};

const fieldOf = (data: unknown, field: string): unknown =>
	typeof data === "object" && data !== null ? (data as Record<string, unknown>)[field] : undefined;

const compare = (a: unknown, b: unknown): number => {
	if (typeof a === "number" && typeof b === "number") return a - b;
	return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
};

/** SQL semantics: any comparison with a missing (NULL) value is false, except `null` which matches it. */
const matches = (data: unknown, where: WhereClause): boolean =>
	Object.entries(where).every(([field, expected]) => {
		const actual = fieldOf(data, field);
		const isMissing = actual === undefined || actual === null;
		if (expected === null) return isMissing;
		if (isMissing) return false;
		if (typeof expected === "object") {
			const spec = expected as Record<string, unknown>;
			if (Array.isArray(spec.in)) return spec.in.some((candidate) => candidate === actual);
			if (typeof spec.startsWith === "string") return typeof actual === "string" && actual.startsWith(spec.startsWith);
			if (spec.gt !== undefined && !(compare(actual, spec.gt) > 0)) return false;
			if (spec.gte !== undefined && !(compare(actual, spec.gte) >= 0)) return false;
			if (spec.lt !== undefined && !(compare(actual, spec.lt) < 0)) return false;
			if (spec.lte !== undefined && !(compare(actual, spec.lte) <= 0)) return false;
			return true;
		}
		return actual === expected;
	});

export interface FakeStorageOptions {
	indexes?: Array<string | string[]>;
	uniqueIndexes?: Array<string | string[]>;
}

export interface FakeStorageCollection<T = unknown> extends StorageCollection<T> {
	/** Throws a serialization error on the next `count` calls to `op` (default: the next call). */
	failNext(op: "updateIf" | "compareAndSet", count?: number): void;
	/** Awaited before every write; lets a test interleave a competing writer deterministically. */
	beforeWrite: ((op: string, id: string) => Promise<void>) | null;
	readonly size: number;
	dump(): Array<{ id: string; data: T; revision: string }>;
}

export const createFakeStorage = <T = unknown>(options: FakeStorageOptions = {}): FakeStorageCollection<T> => {
	const rows = new Map<string, Row<T>>();
	const indexed = new Set((options.indexes ?? []).flat());
	const uniqueGroups = (options.uniqueIndexes ?? []).map((index) => (Array.isArray(index) ? index : [index]));
	for (const group of uniqueGroups) for (const field of group) indexed.add(field);
	const failures = new Map<string, number>();
	let seq = 0;
	let storage!: FakeStorageCollection<T>;

	const tick = (): Promise<void> => Promise.resolve();
	const guardWrite = async (op: string, id: string): Promise<void> => {
		await tick();
		await storage.beforeWrite?.(op, id);
	};
	const maybeFail = (op: string): void => {
		const remaining = failures.get(op) ?? 0;
		if (remaining <= 0) return;
		failures.set(op, remaining - 1);
		throw new FakeStorageSerializationError();
	};
	const assertIndexed = (where: WhereClause, orderBy: Record<string, unknown> = {}): void => {
		for (const field of [...Object.keys(where), ...Object.keys(orderBy)]) {
			if (!indexed.has(field)) throw new FakeStorageQueryError(`Cannot query on non-indexed field '${field}'.`);
		}
	};
	const assertUnique = (id: string, data: T): void => {
		for (const group of uniqueGroups) {
			const values = group.map((field) => fieldOf(data, field));
			if (values.some((value) => value === undefined || value === null)) continue;
			for (const [otherId, other] of rows) {
				if (otherId !== id && group.every((field, index) => fieldOf(other.data, field) === values[index])) {
					throw new Error(`UNIQUE constraint failed: ${group.join(", ")}`);
				}
			}
		}
	};
	const write = (id: string, data: T, revision?: number): Row<T> => {
		const stored = json(data);
		if (new TextEncoder().encode(JSON.stringify(stored)).byteLength > MAX_VALUE_BYTES) throw new TypeError("Conditional storage value must not exceed 1 MiB of JSON");
		assertUnique(id, stored);
		const previous = rows.get(id);
		const row: Row<T> = {
			data: stored,
			revision: revision ?? (previous?.revision ?? 0) + 1,
			createdAt: previous?.createdAt ?? Date.now(),
			seq: previous?.seq ?? ++seq,
		};
		rows.set(id, row);
		return row;
	};
	const toPage = (list: Array<[string, Row<T>]>, cursor: string | undefined, limit: number): PaginatedResult<{ id: string; data: T }> => {
		const start = cursor ? Number.parseInt(cursor, 10) : 0;
		const slice = list.slice(start, start + limit);
		const hasMore = start + limit < list.length;
		return {
			items: slice.map(([id, row]) => ({ id, data: json(row.data) })),
			cursor: hasMore ? String(start + limit) : undefined,
			hasMore,
		};
	};

	storage = {
		beforeWrite: null,
		failNext: (op, count = 1) => void failures.set(op, count),
		get size() {
			return rows.size;
		},
		dump: () => [...rows.entries()].map(([id, row]) => ({ id, data: json(row.data), revision: String(row.revision) })),

		async get(id) {
			await tick();
			const row = rows.get(id);
			return row ? json(row.data) : null;
		},
		async put(id, data) {
			assertKey(id);
			await guardWrite("put", id);
			write(id, data);
		},
		async delete(id) {
			await guardWrite("delete", id);
			return rows.delete(id);
		},
		async exists(id) {
			await tick();
			return rows.has(id);
		},
		async getVersioned(id): Promise<VersionedValue<T> | null> {
			assertKey(id);
			await tick();
			const row = rows.get(id);
			return row ? { value: json(row.data), revision: String(row.revision) } : null;
		},
		async compareAndSet(id, expectedRevision, data): Promise<ConditionalWriteResult> {
			assertKey(id);
			await guardWrite("compareAndSet", id);
			maybeFail("compareAndSet");
			const row = rows.get(id);
			if (expectedRevision === null ? row !== undefined : row === undefined || String(row.revision) !== expectedRevision) {
				return { applied: false };
			}
			return { applied: true, revision: String(write(id, data).revision) };
		},
		async compareAndDelete(id, expectedRevision): Promise<ConditionalDeleteResult> {
			assertKey(id);
			await guardWrite("compareAndDelete", id);
			const row = rows.get(id);
			if (!row || String(row.revision) !== expectedRevision) return { applied: false };
			rows.delete(id);
			return { applied: true };
		},
		async getMany(ids) {
			await tick();
			const found = new Map<string, T>();
			for (const id of ids) {
				const row = rows.get(id);
				if (row) found.set(id, json(row.data));
			}
			return found;
		},
		async putMany(items) {
			for (const item of items) {
				await guardWrite("put", item.id);
				write(item.id, item.data);
			}
		},
		async deleteMany(ids) {
			await tick();
			return ids.filter((id) => rows.delete(id)).length;
		},
		async query(queryOptions: QueryOptions = {}) {
			await tick();
			const { where = {}, orderBy = {}, cursor } = queryOptions;
			const limit = Math.max(1, Math.min(queryOptions.limit ?? 50, 100));
			assertIndexed(where, orderBy);
			const order = Object.entries(orderBy);
			const list = [...rows.entries()]
				.filter(([, row]) => matches(row.data, where))
				.sort(([idA, a], [idB, b]) => {
					for (const [field, direction] of order) {
						const left = fieldOf(a.data, field);
						const right = fieldOf(b.data, field);
						// NULLs rank first in both directions (mirrors the production null-rank sort key).
						const leftMissing = left === undefined || left === null;
						const rightMissing = right === undefined || right === null;
						if (leftMissing !== rightMissing) return leftMissing ? -1 : 1;
						if (leftMissing) continue;
						const diff = compare(left, right);
						if (diff !== 0) return direction === "desc" ? -diff : diff;
					}
					const descending = order.length > 0 && order[0]![1] === "desc";
					if (order.length === 0) return a.seq - b.seq;
					return descending ? idB.localeCompare(idA) : idA.localeCompare(idB);
				});
			return toPage(list, cursor, limit);
		},
		async count(where) {
			await tick();
			if (where) assertIndexed(where);
			return [...rows.values()].filter((row) => matches(row.data, where ?? {})).length;
		},
		async updateIf(id, args: UpdateIfArgs<T>): Promise<UpdateIfResult<T>> {
			assertKey(id);
			if (!args.set && !args.delta) throw new TypeError("Storage update requires at least one of set or delta");
			for (const field of Object.keys(args.set ?? {})) {
				if (field in (args.delta ?? {})) throw new TypeError("Storage field appears in both set and delta");
			}
			await guardWrite("updateIf", id);
			maybeFail("updateIf");
			const row = rows.get(id);
			if (!row || typeof row.data !== "object" || row.data === null) return { applied: false };
			for (const filter of Object.values(args.where)) {
				const spec = filter as { in?: unknown[] } | null;
				if (typeof spec === "object" && spec !== null && Array.isArray(spec.in) && spec.in.length === 0) return { applied: false };
			}
			if (!matches(row.data, args.where)) return { applied: false };
			const next = json(row.data) as Record<string, unknown>;
			for (const [field, delta] of Object.entries(args.delta ?? {}) as Array<[string, { inc: number } | { dec: number }]>) {
				const base = next[field];
				if (base !== undefined && base !== null && typeof base !== "number") return { applied: false };
				const amount = "inc" in delta ? delta.inc : -delta.dec;
				if (!Number.isSafeInteger(amount)) throw new TypeError("Storage delta must be a safe integer");
				const result = ((base as number | undefined | null) ?? 0) + amount;
				if (!Number.isSafeInteger(result)) return { applied: false };
				next[field] = result;
			}
			Object.assign(next, json(args.set ?? {}));
			const written = write(id, next as T);
			return { applied: true, data: json(written.data) };
		},
	};
	return storage;
};

/** In-memory `KVAccess` with the same compare-and-set semantics as plugin KV. */
export const createFakeKv = (): KVAccess & { dump(): Record<string, unknown> } => {
	const rows = new Map<string, { value: unknown; revision: number }>();
	return {
		dump: () => Object.fromEntries([...rows].map(([key, row]) => [key, row.value])),
		async get<V>(key: string) {
			return (rows.get(key)?.value as V | undefined) ?? null;
		},
		async getVersioned<V>(key: string) {
			const row = rows.get(key);
			return row ? { value: json(row.value) as V, revision: String(row.revision) } : null;
		},
		async compareAndSet(key, expectedRevision, value) {
			await Promise.resolve();
			const row = rows.get(key);
			if (expectedRevision === null ? row !== undefined : row === undefined || String(row.revision) !== expectedRevision) {
				return { applied: false };
			}
			const revision = (row?.revision ?? 0) + 1;
			rows.set(key, { value: json(value), revision });
			return { applied: true, revision: String(revision) };
		},
		async compareAndDelete(key, expectedRevision) {
			await Promise.resolve();
			const row = rows.get(key);
			if (!row || String(row.revision) !== expectedRevision) return { applied: false };
			rows.delete(key);
			return { applied: true };
		},
		async set(key, value) {
			rows.set(key, { value: json(value), revision: (rows.get(key)?.revision ?? 0) + 1 });
		},
		async delete(key) {
			return rows.delete(key);
		},
		async list(prefix = "") {
			return [...rows].filter(([key]) => key.startsWith(prefix)).map(([key, row]) => ({ key, value: json(row.value) }));
		},
	};
};
