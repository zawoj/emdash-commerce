import type { KVAccess, PluginContext } from "emdash";

import { KV_KEY } from "../constants.js";
import {
	buildSchemaDefinitions,
	type CollectionDefinition,
	type CollectionNavigation,
	type FieldDefinition,
	type RelationDefinition,
	type SchemaDefinitions,
	type SchemaOptions,
} from "./collections/index.js";

/**
 * Additive schema reconciler over `applySeed`. EmDash has no plugin upgrade hook and `applySeed(..., "skip")` never
 * adds a field to an existing collection, so a new release's collections, relations and fields would never reach
 * an existing database. The reconciler creates what is missing (collections, relations, fields) and adds missing
 * fields to existing collections; it never alters, renames or deletes anything (an editor may have customised a
 * field, or an older release may rely on it). The registry port builds the seed so that an existing collection
 * keeps its stored label, `supports`, placement and every field it already has (see registry-port.ts).
 * The exceptions are sidebar placement and `hidden`: a collection with no folder and no position gets the
 * release's placement and visibility, while one an admin has already placed keeps both.
 *
 * It runs on `plugin:install` / `plugin:activate` and lazily on first use in each process (`ensureSchema`),
 * guarded by a KV lock so two cold starts do not race, and by a KV marker holding a fingerprint of the
 * definitions so a warm start costs one KV read.
 */

/** Bump to force every database to be re-checked even when the definitions' fingerprint is unchanged. */
export const SCHEMA_VERSION = 2;

export interface ExistingCollection {
	slug: string;
	fieldSlugs: ReadonlySet<string>;
	/** The sidebar folder and position as stored; `null` when unset. */
	navigation: { group: string | null; sortOrder: number | null };
}

/** What one reconcile has to create, computed from the difference between the definitions and the database. */
export interface SchemaPlan {
	/** Relations that do not exist yet (an existing relation is never touched). */
	relations: RelationDefinition[];
	/** Collections that do not exist yet, created whole (fields, placement, `hidden`). */
	create: CollectionDefinition[];
	/** Existing collections and the fields they lack. */
	addFields: Array<{ definition: CollectionDefinition; fields: FieldDefinition[] }>;
}

/** The only schema operations the reconciler needs (implemented over `SchemaRegistry` + `applySeed` in registry-port.ts). */
export interface SchemaPort {
	getCollection(slug: string): Promise<ExistingCollection | null>;
	/** The slugs of every relation that exists. */
	getRelationSlugs(): Promise<ReadonlySet<string>>;
	/**
	 * Applies the whole plan in one go (relations need their collections, bound fields need their relation).
	 * Added fields on an existing collection are never required and never change what is already stored.
	 */
	apply(plan: SchemaPlan): Promise<void>;
	/** Sets the sidebar folder, position and visibility of an existing collection. */
	setNavigation(collectionSlug: string, navigation: CollectionNavigation, isHidden: boolean): Promise<void>;
	/**
	 * Replaces an existing field's validation (data migrations only: the reconciler never alters a field).
	 * Returns false when the collection or the field does not exist.
	 */
	setFieldValidation(collectionSlug: string, fieldSlug: string, validation: NonNullable<FieldDefinition["validation"]>): Promise<boolean>;
}

/**
 * The definitions without any relation and without the fields bound to one: what a shop waiting for a site import
 * holds. EmDash's importer counts every row of `_emdash_relations` as content, so a shop that already carries the
 * commerce relations is "not empty" to it; the collections alone are scaffold it replaces.
 */
export const withoutRelations = (definitions: SchemaDefinitions): SchemaDefinitions => ({
	collections: definitions.collections.map((definition) => {
		const fields = definition.fields.filter((field) => !field.validation?.relation);
		const slugs = new Set(fields.map((field) => field.slug));
		// The seed validator rejects a list column that names a field the seed does not carry.
		return { ...definition, fields, listColumns: definition.listColumns.filter((column) => slugs.has(column)) };
	}),
	relations: [],
});

export interface ReconcileResult {
	createdCollections: string[];
	createdRelations: string[];
	addedFields: Array<{ collection: string; field: string }>;
	placedCollections: string[];
}

const isPlaced = (collection: ExistingCollection): boolean =>
	collection.navigation.group !== null || collection.navigation.sortOrder !== null;

/** Accepts the collections alone (no relations) for callers that predate relations. */
const toSchemaDefinitions = (definitions: SchemaDefinitions | readonly CollectionDefinition[]): SchemaDefinitions =>
	Array.isArray(definitions) ? { collections: [...(definitions as readonly CollectionDefinition[])], relations: [] } : (definitions as SchemaDefinitions);

export const reconcileSchema = async (port: SchemaPort, definitions: SchemaDefinitions | readonly CollectionDefinition[]): Promise<ReconcileResult> => {
	const schema = toSchemaDefinitions(definitions);
	const plan: SchemaPlan = { relations: [], create: [], addFields: [] };
	const unplaced: CollectionDefinition[] = [];

	const knownRelations = await port.getRelationSlugs();
	plan.relations = schema.relations.filter((relation) => !knownRelations.has(relation.slug));

	for (const definition of schema.collections) {
		const existing = await port.getCollection(definition.slug);
		if (!existing) {
			plan.create.push(definition);
			continue;
		}
		if (!isPlaced(existing)) unplaced.push(definition);
		const missing = definition.fields.filter((field) => !existing.fieldSlugs.has(field.slug));
		if (missing.length > 0) plan.addFields.push({ definition, fields: missing });
	}

	const hasChanges = plan.relations.length > 0 || plan.create.length > 0 || plan.addFields.length > 0;
	if (hasChanges) await port.apply(plan);
	for (const definition of unplaced) await port.setNavigation(definition.slug, definition.navigation, definition.hidden);

	return {
		createdCollections: plan.create.map((definition) => definition.slug),
		createdRelations: plan.relations.map((relation) => relation.slug),
		addedFields: plan.addFields.flatMap((change) => change.fields.map((field) => ({ collection: change.definition.slug, field: field.slug }))),
		placedCollections: unplaced.map((definition) => definition.slug),
	};
};

// --- Fingerprint, lock and marker ----------------------------------------------------------------------

const toHex = (bytes: Uint8Array): string => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

/** A short stable hash of what the reconciler would create; changes when a release adds a field, a relation, or moves or hides a collection. */
export const fingerprintDefinitions = async (definitions: SchemaDefinitions | readonly CollectionDefinition[]): Promise<string> => {
	const schema = toSchemaDefinitions(definitions);
	const canonical = JSON.stringify([
		schema.collections.map((definition) => [
			definition.slug,
			`${definition.navigation.group}:${definition.navigation.sortOrder}:${definition.hidden ? "h" : ""}`,
			definition.fields.map((field) => `${field.slug}:${field.type}:${field.indexed ? "i" : ""}:${field.validation?.relation ?? ""}:${field.validation?.relationSide ?? ""}`),
		]),
		schema.relations.map((relation) => [
			relation.slug,
			relation.parentCollection,
			relation.childCollection,
			relation.maxChildrenPerParent,
			relation.maxParentsPerChild,
		]),
	]);
	const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
	return `v${SCHEMA_VERSION}:${toHex(new Uint8Array(digest)).slice(0, 16)}`;
};

interface LockValue {
	holder: string;
	expiresAt: number;
}

/** What `ensureSchema` settled on: `isDeferred` means the relations (and the fields bound to them) were left out on purpose. */
export interface EnsureSchemaResult {
	isDeferred: boolean;
}

export interface EnsureSchemaDeps {
	/**
	 * Leave the relations out while the site has none (a shop that is going to receive `emdash site import`). Once any
	 * relation exists, or this is off, the full schema is reconciled as usual.
	 */
	isDeferringRelations?: boolean;
	/** Builds the schema port lazily (opens the database); injectable for tests. */
	createPort: () => Promise<SchemaPort>;
	now?: () => number;
	sleep?: (ms: number) => Promise<void>;
	randomId?: () => string;
	log?: { info(message: string, data?: unknown): void; warn(message: string, data?: unknown): void };
}

const LOCK_TTL_MS = 60_000;
const WAIT_POLL_MS = 250;
const WAIT_MAX_MS = 20_000;

/** Per-process memo: fingerprint → settled promise. A failed attempt is forgotten so the next call retries. */
const memo = new Map<string, Promise<EnsureSchemaResult>>();

export const resetEnsureSchemaMemo = (): void => memo.clear();

const acquireLock = async (kv: KVAccess, holder: string, now: () => number): Promise<boolean> => {
	const claim: LockValue = { holder, expiresAt: now() + LOCK_TTL_MS };
	if ((await kv.compareAndSet(KV_KEY.schemaLock, null, claim)).applied) return true;
	const current = await kv.getVersioned<LockValue>(KV_KEY.schemaLock);
	if (!current) return acquireLock(kv, holder, now);
	if (current.value.expiresAt > now()) return false;
	// The holder died: take the lock over, but only if nobody else did meanwhile.
	return (await kv.compareAndSet(KV_KEY.schemaLock, current.revision, claim)).applied;
};

const releaseLock = async (kv: KVAccess, holder: string): Promise<void> => {
	const current = await kv.getVersioned<LockValue>(KV_KEY.schemaLock);
	if (current?.value.holder === holder) await kv.compareAndDelete(KV_KEY.schemaLock, current.revision);
};

const runReconcile = async (
	kv: KVAccess,
	definitions: SchemaDefinitions,
	fingerprint: string,
	deps: Required<Pick<EnsureSchemaDeps, "now" | "sleep" | "randomId">> & EnsureSchemaDeps,
): Promise<EnsureSchemaResult> => {
	const holder = deps.randomId();
	const startedAt = deps.now();
	const deferredFingerprint = `${fingerprint}:deferred`;
	const readCurrent = async (): Promise<EnsureSchemaResult | null> => {
		const marker = await kv.get<string>(KV_KEY.schemaMarker);
		if (marker === fingerprint) return { isDeferred: false };
		// A deferred marker only satisfies a caller that still defers; one that does not re-runs and completes the schema.
		if (deps.isDeferringRelations && marker === deferredFingerprint) return { isDeferred: true };
		return null;
	};
	for (;;) {
		const current = await readCurrent();
		if (current) return current;
		if (await acquireLock(kv, holder, deps.now)) break;
		if (deps.now() - startedAt > WAIT_MAX_MS) throw new Error("Timed out waiting for another process to finish the commerce schema update");
		await deps.sleep(WAIT_POLL_MS);
	}
	try {
		// Another process may have finished between our marker check and taking the lock.
		const current = await readCurrent();
		if (current) return current;
		const port = await deps.createPort();
		const isDeferred = Boolean(deps.isDeferringRelations) && (await port.getRelationSlugs()).size === 0;
		const result = await reconcileSchema(port, isDeferred ? withoutRelations(definitions) : definitions);
		await kv.set(KV_KEY.schemaMarker, isDeferred ? deferredFingerprint : fingerprint);
		if (isDeferred) deps.log?.info("Commerce relations deferred: the site is waiting for an import; remove COMMERCE_DEFER_RELATIONS and restart to create them");
		if (result.createdCollections.length > 0 || result.createdRelations.length > 0 || result.addedFields.length > 0 || result.placedCollections.length > 0) {
			deps.log?.info("Commerce schema reconciled", {
				createdCollections: result.createdCollections,
				createdRelations: result.createdRelations,
				addedFields: result.addedFields.length,
				placedCollections: result.placedCollections,
			});
		}
		return { isDeferred };
	} finally {
		await releaseLock(kv, holder);
	}
};

/**
 * Makes sure the commerce collections exist with every field this release knows. Safe to call on every
 * request: after the first success in a process it is a map lookup.
 */
export const ensureSchema = async (
	ctx: Pick<PluginContext, "kv" | "log">,
	options: SchemaOptions,
	deps: EnsureSchemaDeps,
): Promise<EnsureSchemaResult> => {
	const definitions = buildSchemaDefinitions(options);
	const fingerprint = await fingerprintDefinitions(definitions);
	const memoKey = `${fingerprint}:${JSON.stringify(options.collections)}:${deps.isDeferringRelations ? "deferred" : "full"}`;
	const cached = memo.get(memoKey);
	if (cached) return cached;
	const attempt = runReconcile(ctx.kv, definitions, fingerprint, {
		now: Date.now,
		sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
		randomId: () => globalThis.crypto.randomUUID(),
		log: ctx.log,
		...deps,
	}).catch((error: unknown) => {
		memo.delete(memoKey);
		throw error;
	});
	memo.set(memoKey, attempt);
	return attempt;
};
