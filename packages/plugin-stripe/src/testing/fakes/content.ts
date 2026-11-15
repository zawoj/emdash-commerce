import type { ContentAccess } from "emdash";

import type { CollectionDefinition } from "../../adapters/emdash/schema/collections.js";

/**
 * A fake of EmDash's plugin `ContentAccess` (read + write + publish) that validates writes against the
 * plugin's own collection definitions and reproduces the storage rules the mappers rely on
 * (emdash/src/database/repositories/content.ts: serializeValue, mapRow, deserializeValue):
 *
 * - unknown field keys and missing required fields are rejected, `select` values must be an option;
 * - booleans are stored as 0/1, objects and arrays as JSON, `null` clears (NULL columns are omitted on read);
 * - new entries are `draft` until published; `list` accepts `fieldFilters` only on `indexed` fields;
 * - `limit` clamps to 100, `cursor` pages through a stable order.
 *
 * `rejectNext` injects a failure for the next call to a method.
 */

type WriteContent = Required<Pick<ContentAccess, "create" | "update" | "delete" | "getVersioned" | "publish">>;
export type FakeContent = ContentAccess &
	WriteContent & {
		rejectNext(method: "create" | "update" | "publish", error?: Error): void;
		seedEntry(collection: string, data: Record<string, unknown>, options?: { id?: string; status?: string; slug?: string | null }): string;
		entries(collection: string): Array<{ id: string; status: string; data: Record<string, unknown> }>;
		/** What a relation needs to know about an entry (slug, title by the collection's title field, published), or null. */
		entryInfo(collection: string, id: string): { slug: string | null; title: string | null; isPublished: boolean } | null;
		/** Creates an entry without validating it against the definition (for the relations fake's `createWithReferences`). */
		createRaw(collection: string, data: Record<string, unknown>, options?: { status?: string; slug?: string | null }): { id: string };
	};

interface StoredEntry {
	id: string;
	slug: string | null;
	status: string;
	data: Record<string, unknown>;
	version: number;
	createdAt: string;
	updatedAt: string;
	seq: number;
}

const normaliseValue = (value: unknown): unknown => {
	if (value === null || value === undefined) return null;
	if (typeof value === "boolean") return value ? 1 : 0;
	if (typeof value === "object") return JSON.parse(JSON.stringify(value));
	return value;
};

const deserialise = (value: unknown): unknown => {
	if (typeof value === "string" && (value.startsWith("{") || value.startsWith("["))) {
		try {
			return JSON.parse(value);
		} catch {
			return value;
		}
	}
	return value;
};

export const createFakeContent = (definitions: readonly CollectionDefinition[], now: () => Date = () => new Date()): FakeContent => {
	const collections = new Map(definitions.map((definition) => [definition.slug, definition]));
	const rows = new Map<string, Map<string, StoredEntry>>();
	const failures = new Map<string, Error>();
	let sequence = 0;

	const definitionOf = (collection: string): CollectionDefinition => {
		const definition = collections.get(collection);
		if (!definition) throw new Error(`Collection "${collection}" not found`);
		return definition;
	};
	const table = (collection: string): Map<string, StoredEntry> => {
		definitionOf(collection);
		let found = rows.get(collection);
		if (!found) rows.set(collection, (found = new Map()));
		return found;
	};
	const failIfRequested = (method: string): void => {
		const error = failures.get(method);
		if (!error) return;
		failures.delete(method);
		throw error;
	};

	const validate = (collection: string, data: Record<string, unknown>, isCreate: boolean): Record<string, unknown> => {
		const definition = definitionOf(collection);
		const bySlug = new Map(definition.fields.map((field) => [field.slug, field]));
		const normalised: Record<string, unknown> = {};
		for (const [key, raw] of Object.entries(data)) {
			if (key === "seo") continue;
			const field = bySlug.get(key);
			if (!field) throw new Error(`Unknown field '${key}' in collection '${collection}'`);
			// The host refuses relation-bound fields in `data` (api/handlers/content.ts: storagelessDataKeyError).
			if (field.validation?.relation) throw new Error(`Reference fields bound to a relation are set through 'references', not 'data': ${key}`);
			const value = normaliseValue(raw);
			if (value !== null) {
				if (field.type === "integer" && !Number.isInteger(value)) throw new Error(`Field '${key}' must be an integer`);
				if (field.type === "select" && !field.validation?.options?.includes(String(value))) {
					throw new Error(`Field '${key}' must be one of ${field.validation?.options?.join(", ")}`);
				}
				if ((field.type === "string" || field.type === "reference") && typeof value !== "string") throw new Error(`Field '${key}' must be a string`);
			}
			normalised[key] = value;
		}
		if (isCreate) {
			for (const field of definition.fields) {
				if (field.validation?.relation) continue;
				if (field.required && (normalised[field.slug] === null || normalised[field.slug] === undefined)) {
					throw new Error(`Field '${field.slug}' is required`);
				}
			}
			for (const field of definition.fields) {
				if (field.defaultValue !== undefined && !(field.slug in normalised)) normalised[field.slug] = normaliseValue(field.defaultValue);
			}
		}
		return normalised;
	};

	const toItem = (collection: string, entry: StoredEntry) => ({
		id: entry.id,
		type: collection,
		slug: entry.slug,
		status: entry.status,
		locale: "en",
		data: Object.fromEntries(Object.entries(entry.data).filter(([, value]) => value !== null).map(([key, value]) => [key, deserialise(value)])),
		createdAt: entry.createdAt,
		updatedAt: entry.updatedAt,
		publishedAt: entry.status === "published" ? entry.updatedAt : null,
		version: entry.version,
	});

	const insert = (collection: string, data: Record<string, unknown>, options: { id?: string; status?: string; slug?: string | null } = {}): StoredEntry => {
		const normalised = validate(collection, data, true);
		const id = options.id ?? `01FAKE${String(++sequence).padStart(6, "0")}`;
		const stamp = now().toISOString();
		const title = definitionOf(collection).titleField;
		const slugSource = typeof data.title === "string" ? data.title : title && typeof data[title] === "string" ? String(data[title]) : null;
		const entry: StoredEntry = {
			id,
			slug: options.slug !== undefined ? options.slug : slugSource ? slugSource.toLowerCase().replace(/[^a-z0-9]+/g, "-") : null,
			status: options.status ?? "draft",
			data: normalised,
			version: 1,
			createdAt: stamp,
			updatedAt: stamp,
			seq: ++sequence,
		};
		table(collection).set(id, entry);
		return entry;
	};

	const content: FakeContent = {
		rejectNext: (method, error = new Error(`${method} failed`)) => void failures.set(method, error),
		seedEntry: (collection, data, options) => insert(collection, data, options).id,
		entryInfo(collection, id) {
			const entry = table(collection).get(id);
			if (!entry) return null;
			const titleField = definitionOf(collection).titleField;
			const data = toItem(collection, entry).data;
			const candidates = [titleField ? data[titleField] : undefined, data.title, data.name];
			const title = candidates.find((value): value is string => typeof value === "string" && value.length > 0) ?? null;
			return { slug: entry.slug, title, isPublished: entry.status === "published" };
		},
		createRaw: (collection, data, options) => ({ id: insert(collection, data, options).id }),
		entries: (collection) => [...table(collection).values()].map((entry) => ({ id: entry.id, status: entry.status, data: toItem(collection, entry).data })),

		async get(collection, id) {
			await Promise.resolve();
			const entry = table(collection).get(id);
			return entry ? toItem(collection, entry) : null;
		},
		async list(collection, options = {}) {
			await Promise.resolve();
			const definition = definitionOf(collection);
			const indexed = new Set(definition.fields.filter((field) => field.indexed).map((field) => field.slug));
			const filters = options.where?.fieldFilters ?? {};
			for (const field of Object.keys(filters)) {
				if (!indexed.has(field)) throw new Error(`Field "${field}" is not indexed`);
			}
			const order = Object.entries(options.orderBy ?? {})[0];
			if (order && !indexed.has(order[0]) && !["createdAt", "updatedAt"].includes(order[0])) throw new Error(`Cannot order by "${order[0]}"`);
			const limit = Math.max(1, Math.min(options.limit ?? 50, 100));
			const matches = [...table(collection).values()]
				.filter((entry) => !options.where?.status || entry.status === options.where.status)
				.filter((entry) =>
					Object.entries(filters).every(([field, expected]) => {
						const actual = entry.data[field] ?? null;
						if (expected === null) return actual === null;
						if (typeof expected === "object" && "in" in expected) return expected.in.some((candidate) => candidate === actual);
						return actual === (typeof expected === "boolean" ? (expected ? 1 : 0) : expected);
					}),
				)
				.sort((a, b) => {
					if (order) {
						const [field, direction] = order;
						const left = (a.data[field] ?? "") as string | number;
						const right = (b.data[field] ?? "") as string | number;
						const diff = left < right ? -1 : left > right ? 1 : 0;
						if (diff !== 0) return direction === "desc" ? -diff : diff;
					}
					return a.seq - b.seq;
				});
			const start = options.cursor ? Number.parseInt(options.cursor, 10) : 0;
			const page = matches.slice(start, start + limit);
			const hasMore = start + limit < matches.length;
			return { items: page.map((entry) => toItem(collection, entry)), cursor: hasMore ? String(start + limit) : undefined, hasMore };
		},
		async create(collection, data) {
			await Promise.resolve();
			failIfRequested("create");
			return toItem(collection, insert(collection, data));
		},
		async update(collection, id, data) {
			await Promise.resolve();
			failIfRequested("update");
			const entry = table(collection).get(id);
			if (!entry) throw new Error("Content not found");
			Object.assign(entry.data, validate(collection, data, false));
			entry.version += 1;
			entry.updatedAt = now().toISOString();
			return toItem(collection, entry);
		},
		async delete(collection, id) {
			return table(collection).delete(id);
		},
		async getVersioned(collection, id) {
			const entry = table(collection).get(id);
			return entry ? { item: toItem(collection, entry), _rev: String(entry.version) } : null;
		},
		async publish(collection, id, options) {
			failIfRequested("publish");
			const entry = table(collection).get(id);
			if (!entry) throw new Error("Content not found");
			if (String(entry.version) !== options._rev) throw new Error("Content was modified");
			entry.status = "published";
			entry.version += 1;
			return { item: toItem(collection, entry), _rev: String(entry.version) };
		},
	};
	return content;
};
