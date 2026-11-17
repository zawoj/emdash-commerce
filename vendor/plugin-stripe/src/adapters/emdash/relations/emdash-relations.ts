import { handleContentCreate, handleContentGet, handleContentUpdate } from "emdash";
import { getDb } from "emdash/runtime";

import {
	RELATION_ERROR,
	RelationError,
	type CreateWithReferencesInput,
	type RelationEntry,
	type RelationErrorKind,
	type RelationPage,
	type RelationsPort,
} from "./port.js";

type Database = Parameters<typeof handleContentGet>[0];
type HostFailure = { code: string; message: string };

const failureKind = (code: string): RelationErrorKind => {
	if (code === "NOT_FOUND" || code === "COLLECTION_NOT_FOUND") return RELATION_ERROR.notFound;
	if (code === "VALIDATION_ERROR") return RELATION_ERROR.invalid;
	return RELATION_ERROR.failed;
};

/** Unwraps a handler's `ApiResult`: a failure becomes a typed error carrying the host's code and message. */
const unwrap = <T>(result: { success: true; data: T } | { success: false; error: HostFailure }): T => {
	if (result.success) return result.data;
	throw new RelationError(failureKind(result.error.code), result.error.code, result.error.message);
};

const toEntry = (ref: { id: string; slug: string | null; collection: string; title: string | null; sortOrder?: number }): RelationEntry => ({
	id: ref.id,
	slug: ref.slug,
	collection: ref.collection,
	title: ref.title,
	sortOrder: ref.sortOrder ?? null,
});

/**
 * `RelationsPort` over EmDash's exported content handlers (`handleContentGet` / `handleContentCreate` /
 * `handleContentUpdate` with `references`) and the request-scoped database. The handlers write a field's whole
 * selection immediately, even on a collection with revisions, and skip the content hooks; reading goes through
 * `item.references[field].children` (the key is `children` for both sides of a relation).
 */
export const createEmDashRelations = (getDatabase: () => Promise<Database> = async () => (await getDb()) as Database): RelationsPort => {
	const readFields = async (collection: string, id: string, fields: readonly string[], includeDrafts: boolean) => {
		const db = await getDatabase();
		const { item } = unwrap(await handleContentGet(db, collection, id, undefined, { includeDrafts }));
		return Object.fromEntries(
			fields.map((field) => {
				const reference = item.references?.[field];
				if (!reference) {
					throw new RelationError(RELATION_ERROR.invalid, "VALIDATION_ERROR", `Field '${field}' is not a relation field on ${collection}`);
				}
				return [field, reference] as const;
			}),
		);
	};
	const readField = async (collection: string, id: string, field: string, includeDrafts: boolean) => (await readFields(collection, id, [field], includeDrafts))[field]!;
	const toPage = (reference: Awaited<ReturnType<typeof readField>>, limit: number | undefined): RelationPage => {
		const items = reference.children.map(toEntry);
		const isCut = limit !== undefined && items.length > limit;
		return { items: isCut ? items.slice(0, limit) : items, hasMore: isCut || Boolean(reference.nextCursor) };
	};

	return {
		async children(collection, id, field, options): Promise<RelationPage> {
			return toPage(await readField(collection, id, field, options.includeDrafts), options.limit);
		},
		async fields(collection, id, fields, options) {
			const references = await readFields(collection, id, fields, options.includeDrafts);
			return Object.fromEntries(Object.entries(references).map(([field, reference]) => [field, toPage(reference, options.limit)]));
		},
		async parentOf(collection, id, field, options) {
			const reference = await readField(collection, id, field, options.includeDrafts);
			const first = reference.children[0];
			return first ? toEntry(first) : null;
		},
		async setChildren(collection, id, field, ids) {
			const db = await getDatabase();
			unwrap(await handleContentUpdate(db, collection, id, { references: { [field]: [...ids] } }));
		},
		async setParent(collection, id, field, parentId) {
			const db = await getDatabase();
			unwrap(await handleContentUpdate(db, collection, id, { references: { [field]: parentId === null ? [] : [parentId] } }));
		},
		async createWithReferences(collection, input: CreateWithReferencesInput, references) {
			const db = await getDatabase();
			const created = unwrap(
				await handleContentCreate(db, collection, {
					data: input.data,
					...(input.slug !== undefined ? { slug: input.slug } : {}),
					...(input.status ? { status: input.status } : {}),
					references: Object.fromEntries(Object.entries(references).map(([field, ids]) => [field, [...ids]])),
				}),
			);
			return { id: created.item.id };
		},
	};
};
