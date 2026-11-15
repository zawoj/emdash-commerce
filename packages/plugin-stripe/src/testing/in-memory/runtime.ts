import type { CasResult, Versioned } from "../../ports/repositories.js";

/** Lets concurrent callers interleave at every store call, like a real database round trip. */
export const tick = (): Promise<void> => Promise.resolve();

export const clone = <T>(value: T): T => structuredClone(value);

/**
 * A keyed document map with a revision per document: the in-memory twin of one plugin-storage
 * collection read through `getVersioned` / `compareAndSet`.
 */
export class VersionedMap<T> {
	private readonly rows = new Map<string, { value: T; revision: number }>();

	async get(id: string): Promise<Versioned<T> | null> {
		await tick();
		const row = this.rows.get(id);
		return row ? { value: clone(row.value), revision: String(row.revision) } : null;
	}

	/** `expectedRevision` null creates only when absent. */
	async put(id: string, value: T, expectedRevision: string | null): Promise<CasResult> {
		await tick();
		const row = this.rows.get(id);
		if (expectedRevision === null ? row !== undefined : row === undefined || String(row.revision) !== expectedRevision) {
			return { applied: false };
		}
		const revision = (row?.revision ?? 0) + 1;
		this.rows.set(id, { value: clone(value), revision });
		return { applied: true, revision: String(revision) };
	}

	/** Unconditional write (storage `put`). */
	async set(id: string, value: T): Promise<void> {
		await tick();
		this.rows.set(id, { value: clone(value), revision: (this.rows.get(id)?.revision ?? 0) + 1 });
	}

	async delete(id: string): Promise<boolean> {
		await tick();
		return this.rows.delete(id);
	}

	all(): Array<{ id: string; value: T; revision: string }> {
		return [...this.rows.entries()].map(([id, row]) => ({ id, value: clone(row.value), revision: String(row.revision) }));
	}

	get size(): number {
		return this.rows.size;
	}
}

export const toCursorPage = <T>(items: readonly T[], cursor: string | null, limit: number): { items: T[]; cursor: string | null } => {
	const start = cursor ? Number.parseInt(cursor, 10) : 0;
	const slice = items.slice(start, start + limit);
	const nextStart = start + limit;
	return { items: slice, cursor: nextStart < items.length ? String(nextStart) : null };
};
