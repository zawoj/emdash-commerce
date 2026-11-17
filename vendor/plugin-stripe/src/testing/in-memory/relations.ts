import type { SchemaDefinitions, RelationDefinition, RelationSide } from "../../adapters/emdash/schema/collections/index.js";
import {
	RELATION_ERROR,
	RELATIONS_PAGE_SIZE,
	RelationError,
	type CreateWithReferencesInput,
	type RelationEntry,
	type RelationsPort,
} from "../../adapters/emdash/relations/port.js";

/** What the relations need to know about an entry; the default registry or a fake content store supplies it. */
export interface EntryInfo {
	slug: string | null;
	title: string | null;
	isPublished: boolean;
}

export interface InMemoryRelationsOptions {
	/** Looks an entry up by collection and id. Defaults to the port's own registry (`registerEntry`). */
	lookup?: (collection: string, id: string) => EntryInfo | null;
	/** Creates the entry for `createWithReferences`. Defaults to registering it in the port's own registry. */
	createEntry?: (collection: string, input: CreateWithReferencesInput) => { id: string };
}

export interface InMemoryRelations extends RelationsPort {
	/** Registers an entry in the default registry (ignored when `lookup` is supplied). */
	registerEntry(collection: string, id: string, info?: Partial<EntryInfo>): void;
	setPublished(collection: string, id: string, isPublished: boolean): void;
	/** Every edge of a relation, parent first, in stored order (for assertions). */
	edges(relation: string): Array<{ parent: string; child: string }>;
}

interface FieldBinding {
	field: string;
	collection: string;
	relation: RelationDefinition;
	side: RelationSide;
	isRequired: boolean;
}

const invalid = (message: string): RelationError => new RelationError(RELATION_ERROR.invalid, "VALIDATION_ERROR", message);
const notFound = (message: string): RelationError => new RelationError(RELATION_ERROR.notFound, "NOT_FOUND", message);

/**
 * The in-memory twin of `createEmDashRelations`: edges per relation as an ordered list, whole-set replace on every
 * write, both limits of a relation enforced like EmDash does, unpublished entries hidden on live reads, one page of
 * `RELATIONS_PAGE_SIZE` per read. The relations contract (testing/contracts/relations.contract.ts) runs against both.
 */
export const createInMemoryRelations = (schema: SchemaDefinitions, options: InMemoryRelationsOptions = {}): InMemoryRelations => {
	const registry = new Map<string, EntryInfo>();
	const keyOf = (collection: string, id: string): string => `${collection}\u0000${id}`;
	const lookup = options.lookup ?? ((collection, id) => registry.get(keyOf(collection, id)) ?? null);
	let created = 0;
	const createEntry =
		options.createEntry ??
		((collection: string, input: CreateWithReferencesInput) => {
			created += 1;
			const id = `rel-entry-${created}`;
			registry.set(keyOf(collection, id), { slug: input.slug ?? null, title: typeof input.data.name === "string" ? input.data.name : null, isPublished: input.status === "published" });
			return { id };
		});

	const bindings = new Map<string, FieldBinding>();
	for (const collection of schema.collections) {
		for (const field of collection.fields) {
			const relationSlug = field.validation?.relation;
			const relation = schema.relations.find((candidate) => candidate.slug === relationSlug);
			if (!relation || !field.validation?.relationSide) continue;
			bindings.set(keyOf(collection.slug, field.slug), { field: field.slug, collection: collection.slug, relation, side: field.validation.relationSide, isRequired: field.required ?? false });
		}
	}

	/** relation slug → edges in stored order. Children of one parent keep their relative order. */
	const edges = new Map<string, Array<{ parent: string; child: string }>>();
	const edgesOf = (relation: string) => {
		const list = edges.get(relation) ?? [];
		edges.set(relation, list);
		return list;
	};

	const bindingOf = (collection: string, field: string): FieldBinding => {
		const binding = bindings.get(keyOf(collection, field));
		if (!binding) throw invalid(`Field '${field}' is not a relation field on ${collection}`);
		return binding;
	};
	const requireEntry = (collection: string, id: string, what: string): EntryInfo => {
		const info = lookup(collection, id);
		if (!info) throw notFound(`${what} '${id}' not found in ${collection}`);
		return info;
	};
	const toEntry = (collection: string, id: string, sortOrder: number | null): RelationEntry => {
		const info = lookup(collection, id)!;
		return { id, slug: info.slug, collection, title: info.title, sortOrder };
	};

	const otherCollection = (binding: FieldBinding): string =>
		binding.side === "parent" ? binding.relation.childCollection : binding.relation.parentCollection;
	const ownLimit = (binding: FieldBinding): number | null =>
		binding.side === "parent" ? binding.relation.maxChildrenPerParent : binding.relation.maxParentsPerChild;
	const farLimit = (binding: FieldBinding): number | null =>
		binding.side === "parent" ? binding.relation.maxParentsPerChild : binding.relation.maxChildrenPerParent;

	const validateSelection = (binding: FieldBinding, id: string, selected: readonly string[]): void => {
		const limit = ownLimit(binding);
		if (limit !== null && selected.length > limit) {
			throw invalid(limit === 1 ? `Field '${binding.field}' accepts a single reference, received ${selected.length}.` : `Field '${binding.field}' accepts at most ${limit} references, received ${selected.length}.`);
		}
		if (binding.isRequired && selected.length === 0) throw invalid(`Field '${binding.field}' is required and must reference at least one entry.`);
		const list = edgesOf(binding.relation.slug);
		for (const other of selected) {
			requireEntry(otherCollection(binding), other, binding.side === "parent" ? "Child entry" : "Parent entry");
			const far = farLimit(binding);
			if (far === null) continue;
			const existing = list.filter((edge) => (binding.side === "parent" ? edge.child === other && edge.parent !== id : edge.parent === other && edge.child !== id)).length;
			if (existing + 1 > far) {
				throw invalid(far === 1 ? `Entry '${other}' already has a ${binding.side} on this relation, which allows one.` : `Entry '${other}' already has the maximum of ${far} ${binding.side} entries on this relation.`);
			}
		}
	};

	const write = (binding: FieldBinding, id: string, selected: readonly string[]): void => {
		const list = edgesOf(binding.relation.slug);
		const kept = list.filter((edge) => (binding.side === "parent" ? edge.parent !== id : edge.child !== id));
		const added = selected.map((other) => (binding.side === "parent" ? { parent: id, child: other } : { parent: other, child: id }));
		edges.set(binding.relation.slug, [...kept, ...added]);
	};

	const read = (collection: string, id: string, field: string, includeDrafts: boolean): { items: RelationEntry[]; hasMore: boolean } => {
		const binding = bindingOf(collection, field);
		requireEntry(collection, id, "Content item");
		const mine = edgesOf(binding.relation.slug).filter((edge) => (binding.side === "parent" ? edge.parent === id : edge.child === id));
		const page = mine.slice(0, RELATIONS_PAGE_SIZE);
		const items = page.flatMap((edge, index) => {
			const otherId = binding.side === "parent" ? edge.child : edge.parent;
			const info = lookup(otherCollection(binding), otherId);
			if (!info || (!includeDrafts && !info.isPublished)) return [];
			// A child's parent carries the child's position among that parent's children (the edge's sort order).
			const position = binding.side === "parent" ? index : edgesOf(binding.relation.slug).filter((candidate) => candidate.parent === otherId).indexOf(edge);
			return [toEntry(otherCollection(binding), otherId, position)];
		});
		return { items, hasMore: mine.length > RELATIONS_PAGE_SIZE };
	};

	const replace = async (collection: string, id: string, field: string, selected: readonly string[]): Promise<void> => {
		await Promise.resolve();
		const binding = bindingOf(collection, field);
		requireEntry(collection, id, "Content item");
		validateSelection(binding, id, selected);
		write(binding, id, selected);
	};

	return {
		registerEntry(collection, id, info = {}) {
			registry.set(keyOf(collection, id), { slug: info.slug ?? null, title: info.title ?? null, isPublished: info.isPublished ?? true });
		},
		setPublished(collection, id, isPublished) {
			const info = registry.get(keyOf(collection, id));
			if (info) info.isPublished = isPublished;
		},
		edges: (relation) => edgesOf(relation).map((edge) => ({ ...edge })),
		async children(collection, id, field, readOptions) {
			await Promise.resolve();
			const page = read(collection, id, field, readOptions.includeDrafts);
			const limit = readOptions.limit;
			const isCut = limit !== undefined && page.items.length > limit;
			return { items: isCut ? page.items.slice(0, limit) : page.items, hasMore: isCut || page.hasMore };
		},
		async fields(collection, id, fields, readOptions) {
			await Promise.resolve();
			const entries = fields.map((field) => {
				const page = read(collection, id, field, readOptions.includeDrafts);
				const limit = readOptions.limit;
				const isCut = limit !== undefined && page.items.length > limit;
				return [field, { items: isCut ? page.items.slice(0, limit) : page.items, hasMore: isCut || page.hasMore }] as const;
			});
			return Object.fromEntries(entries);
		},
		async parentOf(collection, id, field, readOptions) {
			await Promise.resolve();
			return read(collection, id, field, readOptions.includeDrafts).items[0] ?? null;
		},
		setChildren: replace,
		setParent: (collection, id, field, parentId) => replace(collection, id, field, parentId === null ? [] : [parentId]),
		async createWithReferences(collection, input, references) {
			await Promise.resolve();
			for (const [key, binding] of bindings) {
				if (!key.startsWith(`${collection}\u0000`) || !binding.isRequired) continue;
				if (!Object.hasOwn(references, binding.field)) throw invalid(`Field '${binding.field}' is required and must reference at least one entry.`);
			}
			// Resolve the whole selection before the entry exists, like the host (nothing is written on failure).
			const bound = Object.entries(references).map(([field, selected]) => ({ binding: bindingOf(collection, field), selected }));
			for (const { binding, selected } of bound) validateSelection(binding, "", selected);
			const { id } = createEntry(collection, input);
			for (const { binding, selected } of bound) write(binding, id, selected);
			return { id };
		},
	};
};
