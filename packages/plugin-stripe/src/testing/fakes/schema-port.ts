import type { CollectionDefinition, CollectionNavigation } from "../../adapters/emdash/schema/collections/index.js";
import type { SchemaPlan, SchemaPort } from "../../adapters/emdash/schema/reconcile.js";

const noop = async (): Promise<void> => undefined;

/** The relation slugs the definitions' fields bind to (all of them "exist" in a ready schema). */
const boundRelationSlugs = (definitions: readonly CollectionDefinition[]): Set<string> =>
	new Set(definitions.flatMap((definition) => definition.fields.flatMap((field) => (field.validation?.relation ? [field.validation.relation] : []))));

/** A schema where every collection already exists with every field and its sidebar placement: reconcile is a no-op. */
export const createReadySchemaPort = (definitions: readonly CollectionDefinition[]): SchemaPort => {
	const bySlug = new Map(definitions.map((definition) => [definition.slug, definition]));
	const allFields = new Set(definitions.flatMap((definition) => definition.fields.map((field) => field.slug)));
	const relations = boundRelationSlugs(definitions);
	return {
		getCollection: async (slug) => {
			const navigation = bySlug.get(slug)?.navigation;
			return { slug, fieldSlugs: allFields, navigation: { group: navigation?.group ?? null, sortOrder: navigation?.sortOrder ?? null } };
		},
		getRelationSlugs: async () => relations,
		apply: noop,
		setNavigation: noop,
		setFieldValidation: async () => true,
	};
};

/** A port whose writes do nothing and which reports every collection as missing (for tests that never reach the schema). */
export const createInertSchemaPort = (): SchemaPort => ({
	getCollection: async () => null,
	getRelationSlugs: async () => new Set(),
	apply: noop,
	setNavigation: noop,
	setFieldValidation: async () => false,
});

export interface StoredNavigation {
	group: string | null;
	sortOrder: number | null;
}

export type MemorySchemaPort = SchemaPort & {
	/** Collection slug → field slugs. */
	schema: Map<string, Set<string>>;
	navigation: Map<string, StoredNavigation>;
	hidden: Map<string, boolean>;
	relations: Set<string>;
	/** One entry per operation: `create:c`, `add:c.f`, `relation:r`, `place:c`, `apply`. */
	calls: string[];
	/** Slugs of collections created through `apply`, in order. */
	created: string[];
	/** Every plan `apply` received. */
	plans: SchemaPlan[];
	/** `apply` throws when the plan creates this collection. */
	failOn: string | null;
};

/**
 * An in-memory schema with the registry's behaviour: creating a collection creates its fields and stores its sidebar
 * placement and visibility; adding fields only adds. Collections passed in `initial` start unplaced unless
 * `placement` says otherwise; `relations` start as existing relations.
 */
export const createMemorySchemaPort = (
	initial: Record<string, readonly string[]> = {},
	placement: Record<string, StoredNavigation> = {},
	relations: readonly string[] = [],
): MemorySchemaPort => {
	const schema = new Map(Object.entries(initial).map(([slug, fields]) => [slug, new Set(fields)]));
	const navigation = new Map<string, StoredNavigation>(Object.keys(initial).map((slug) => [slug, placement[slug] ?? { group: null, sortOrder: null }]));
	const hidden = new Map<string, boolean>();
	const port: MemorySchemaPort = {
		schema,
		navigation,
		hidden,
		relations: new Set(relations),
		calls: [],
		created: [],
		plans: [],
		failOn: null,
		async getCollection(slug) {
			await Promise.resolve();
			const fields = schema.get(slug);
			return fields ? { slug, fieldSlugs: new Set(fields), navigation: navigation.get(slug) ?? { group: null, sortOrder: null } } : null;
		},
		async getRelationSlugs() {
			await Promise.resolve();
			return new Set(port.relations);
		},
		async apply(plan) {
			await Promise.resolve();
			port.plans.push(plan);
			port.calls.push("apply");
			for (const definition of plan.create) if (port.failOn === definition.slug) throw new Error("database is locked");
			for (const relation of plan.relations) {
				port.calls.push(`relation:${relation.slug}`);
				port.relations.add(relation.slug);
			}
			for (const definition of plan.create) {
				port.calls.push(`create:${definition.slug}`);
				port.created.push(definition.slug);
				if (schema.has(definition.slug)) continue;
				schema.set(definition.slug, new Set(definition.fields.map((field) => field.slug)));
				navigation.set(definition.slug, definition.navigation);
				hidden.set(definition.slug, definition.hidden);
			}
			for (const change of plan.addFields) {
				for (const field of change.fields) {
					port.calls.push(`add:${change.definition.slug}.${field.slug}`);
					schema.get(change.definition.slug)!.add(field.slug);
				}
			}
		},
		async setFieldValidation() {
			await Promise.resolve();
			return false;
		},
		async setNavigation(collection: string, placed: CollectionNavigation, isHidden: boolean) {
			await Promise.resolve();
			port.calls.push(`place:${collection}`);
			navigation.set(collection, placed);
			hidden.set(collection, isHidden);
		},
	};
	return port;
};
