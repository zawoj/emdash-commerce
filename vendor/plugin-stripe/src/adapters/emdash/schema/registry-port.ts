import { SchemaError, SchemaRegistry, applySeed, type Collection, type SeedCollection, type SeedField, type SeedFile } from "emdash";
import { getDb } from "emdash/runtime";

import type { CollectionDefinition, FieldDefinition, RelationDefinition } from "./collections/index.js";
import type { SchemaPlan, SchemaPort } from "./reconcile.js";

type SeedRelation = NonNullable<SeedFile["relations"]>[number];
type Database = Parameters<typeof applySeed>[0];

const isSchemaError = (error: unknown, code: string): boolean =>
	error instanceof SchemaError ? error.code === code : error instanceof Error && (error as { code?: unknown }).code === code;

const toSeedField = (field: FieldDefinition, isNewCollection: boolean): SeedField => ({
	slug: field.slug,
	label: field.label,
	type: field.type,
	// Adding a required column to a table that already has rows would backfill empty values.
	required: isNewCollection ? (field.required ?? false) : false,
	unique: field.unique ?? false,
	indexed: field.indexed ?? false,
	searchable: field.searchable ?? false,
	...(field.defaultValue !== undefined ? { defaultValue: field.defaultValue } : {}),
	...(field.validation ? { validation: { ...field.validation } } : {}),
	...(field.options ? { options: { ...field.options } } : {}),
});

const toSeedRelation = (relation: RelationDefinition): SeedRelation => ({
	slug: relation.slug,
	parentCollection: relation.parentCollection,
	childCollection: relation.childCollection,
	parentLabel: relation.parentLabel,
	...(relation.parentLabelSingular ? { parentLabelSingular: relation.parentLabelSingular } : {}),
	childLabel: relation.childLabel,
	...(relation.childLabelSingular ? { childLabelSingular: relation.childLabelSingular } : {}),
	maxChildrenPerParent: relation.maxChildrenPerParent,
	maxParentsPerChild: relation.maxParentsPerChild,
});

/** A collection the seed creates: the full definition, placement and `hidden` included. */
const toNewSeedCollection = (definition: CollectionDefinition): SeedCollection => ({
	slug: definition.slug,
	label: definition.label,
	labelSingular: definition.labelSingular,
	description: definition.description,
	icon: definition.icon,
	group: definition.navigation.group,
	sortOrder: definition.navigation.sortOrder,
	supports: definition.supports,
	routable: definition.routable,
	...(definition.urlPattern ? { urlPattern: definition.urlPattern } : {}),
	hidden: definition.hidden,
	admin: { listColumns: definition.listColumns, quickCreate: !definition.isPluginOwned },
	...(definition.titleField ? { titleField: definition.titleField } : {}),
	fields: definition.fields.map((field) => toSeedField(field, true)),
});

/**
 * A collection that already exists: `applySeed(..., { onConflict: "update" })` rewrites the collection row from the
 * seed (label, `supports`, and `has_seo` derived from it, which an omitted `supports` resets to none), so the
 * seed carries what is stored and only the missing fields. Fields the seed does not list are never touched; the
 * ones it lists are rewritten, which is why only missing ones are listed (apply.ts:455-481, 1792-1822).
 * `admin`, `titleField` and `dateField` are left out: validateSeed checks them against the fields IN the seed
 * (so a column naming a stored field would be rejected), and leaving them undefined leaves them unchanged.
 */
const toExistingSeedCollection = (stored: Collection, fields: readonly FieldDefinition[]): SeedCollection => ({
	slug: stored.slug,
	label: stored.label,
	labelSingular: stored.labelSingular,
	description: stored.description,
	icon: stored.icon,
	supports: stored.supports as NonNullable<SeedCollection["supports"]>,
	urlPattern: stored.urlPattern,
	routable: stored.routable,
	hidden: stored.hidden,
	sortOrder: stored.sortOrder,
	group: stored.group,
	commentsEnabled: stored.commentsEnabled,
	editLocking: stored.editLocking,
	fields: fields.map((field) => toSeedField(field, false)),
});

/**
 * `SchemaPort` over EmDash's `SchemaRegistry` and `applySeed` (`emdash` + `getDb` from `emdash/runtime`). One
 * seed carries the plan's missing relations, new collections and missing fields, so a relation, the collections
 * at both ends and the fields bound to it are created together in the order EmDash needs (relations before
 * fields); `createField` cannot do that, it leaves a relation-bound field without edges.
 */
export const createRegistryPortFor = (db: Database): SchemaPort => {
	const registry = new SchemaRegistry(db as never);
	return {
		async getCollection(slug) {
			const collection = await registry.getCollectionWithFields(slug);
			if (!collection) return null;
			return {
				slug,
				fieldSlugs: new Set(collection.fields.map((field) => field.slug)),
				navigation: { group: collection.group ?? null, sortOrder: collection.sortOrder ?? null },
			};
		},
		async getRelationSlugs() {
			const rows = await db.selectFrom("_emdash_relations").select("slug").execute();
			return new Set(rows.map((row) => row.slug));
		},
		async apply(plan: SchemaPlan) {
			const collections: SeedCollection[] = plan.create.map(toNewSeedCollection);
			for (const change of plan.addFields) {
				const stored = await registry.getCollection(change.definition.slug);
				if (!stored) throw new Error(`Collection "${change.definition.slug}" disappeared while the schema was being reconciled`);
				collections.push(toExistingSeedCollection(stored, change.fields));
			}
			try {
				await applySeed(db, { version: "1", relations: plan.relations.map(toSeedRelation), collections }, { onConflict: "update" });
			} catch (error) {
				if (!isSchemaError(error, "COLLECTION_EXISTS")) throw error;
				// A concurrent process created it, or a deletion still holds the slug. Either way this attempt stopped
				// part-way; the next reconcile plans from what exists now, so fail instead of reporting success.
				throw new Error("A commerce collection already exists or is still being deleted; the schema reconcile will retry", { cause: error });
			}
		},
		async setFieldValidation(collectionSlug, fieldSlug, validation) {
			const collection = await registry.getCollectionWithFields(collectionSlug);
			if (!collection?.fields.some((field) => field.slug === fieldSlug)) return false;
			await registry.updateField(collectionSlug, fieldSlug, { validation });
			return true;
		},
		async setNavigation(collectionSlug, navigation, isHidden) {
			await registry.updateCollection(collectionSlug, { group: navigation.group, sortOrder: navigation.sortOrder, hidden: isHidden });
		},
	};
};

/** The production port: the registry over the request-scoped database (`getDb` from `emdash/runtime`). */
export const createRegistryPort = async (): Promise<SchemaPort> => createRegistryPortFor((await getDb()) as Database);
