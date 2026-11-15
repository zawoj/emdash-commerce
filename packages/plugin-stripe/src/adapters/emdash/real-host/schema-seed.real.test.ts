import { SchemaRegistry, applySeed } from "emdash";
import { describe, expect, it } from "vitest";

import { RELATIONS_TEST_SCHEMA } from "../../../testing/contracts/relations.contract.js";
import { createEmDashRelations } from "../relations/emdash-relations.js";
import type { SchemaDefinitions } from "../schema/collections/index.js";
import { reconcileSchema } from "../schema/reconcile.js";
import { createRegistryPortFor } from "../schema/registry-port.js";
import { createRealDatabase } from "./host.js";

/** The test schema as an older release shipped it: the same collections without any relation field. */
const withoutRelations = (schema: SchemaDefinitions): SchemaDefinitions => ({
	relations: [],
	collections: schema.collections.map((collection) => ({ ...collection, fields: collection.fields.filter((field) => !field.validation?.relation) })),
});

const setup = async () => {
	const db = await createRealDatabase();
	return { db, registry: new SchemaRegistry(db as never), port: createRegistryPortFor(db as never) };
};

const fieldsOf = async (registry: SchemaRegistry, slug: string) => (await registry.getCollectionWithFields(slug))!.fields;

describe("schema reconciler over applySeed: relations", () => {
	it("creates the relations, both ends and the bound fields in one pass, with the hidden flag", async () => {
		const { db, registry, port } = await setup();
		const result = await reconcileSchema(port, RELATIONS_TEST_SCHEMA);
		expect(result.createdRelations.sort()).toEqual(["author_books", "book_reviews", "category_tree", "shelf_books"]);
		expect(result.createdCollections).toEqual(["authors", "books", "shelves", "categories", "reviews"]);
		const author = (await fieldsOf(registry, "books")).find((field) => field.slug === "author")!;
		expect(author).toMatchObject({ type: "reference", validation: { relation: "author_books", relationSide: "child", targetCollection: "authors" } });
		const reviewBook = (await fieldsOf(registry, "reviews")).find((field) => field.slug === "book")!;
		expect(reviewBook.required).toBe(true);
		const rows = await (db as never as { selectFrom(t: string): { selectAll(): { execute(): Promise<Array<Record<string, unknown>>> } } }).selectFrom("_emdash_relations").selectAll().execute();
		expect(rows.find((row) => row.slug === "author_books")).toMatchObject({ parent_collection: "authors", child_collection: "books", max_children_per_parent: null, max_parents_per_child: 1 });
		expect(rows.find((row) => row.slug === "category_tree")).toMatchObject({ parent_collection: "categories", child_collection: "categories" });
		expect(await reconcileSchema(port, RELATIONS_TEST_SCHEMA)).toEqual({ createdCollections: [], createdRelations: [], addedFields: [], placedCollections: [] });
	});

	it("creates a hidden collection hidden, and a visible one visible", async () => {
		const { registry, port } = await setup();
		const schema: SchemaDefinitions = { ...RELATIONS_TEST_SCHEMA, collections: RELATIONS_TEST_SCHEMA.collections.map((collection) => ({ ...collection, hidden: collection.slug === "books" })) };
		await reconcileSchema(port, schema);
		expect((await registry.getCollection("books"))!.hidden).toBe(true);
		expect((await registry.getCollection("authors"))!.hidden).toBe(false);
	});

	it("gives an existing collection a relation field it lacked, and the edges then work", async () => {
		const { db, registry, port } = await setup();
		await reconcileSchema(port, withoutRelations(RELATIONS_TEST_SCHEMA));
		const result = await reconcileSchema(port, RELATIONS_TEST_SCHEMA);
		expect(result.createdCollections).toEqual([]);
		expect(result.createdRelations).toHaveLength(4);
		expect(result.addedFields.map((added) => `${added.collection}.${added.field}`).sort()).toEqual([
			"authors.books",
			"books.author",
			"books.reviews",
			"books.shelves",
			"categories.parent",
			"categories.subcategories",
			"reviews.book",
			"shelves.books",
		]);
		const relations = createEmDashRelations(async () => db as never);
		const { handleContentCreate } = await import("emdash");
		const make = async (collection: string, name: string) => {
			const created = await handleContentCreate(db as never, collection, { data: { name }, status: "published" });
			if (!created.success) throw new Error(created.error.message);
			return created.data.item.id;
		};
		const author = await make("authors", "A");
		const book = await make("books", "B");
		await relations.setChildren("authors", author, "books", [book]);
		expect((await relations.children("authors", author, "books", { includeDrafts: false })).items.map((item) => item.title)).toEqual(["B"]);
		// A required relation field added to a collection that already holds rows is created optional.
		expect((await fieldsOf(registry, "reviews")).find((field) => field.slug === "book")!.required).toBe(false);
		const review = await handleContentCreate(db as never, "reviews", { data: { name: "R" }, status: "published", references: {} });
		expect(review.success).toBe(true);
	});
});

describe("schema reconciler over applySeed: what an editor changed survives", () => {
	const customise = async (registry: SchemaRegistry) => {
		await registry.updateField("authors", "name", { label: "Editor's label", searchable: true });
		await registry.createField("authors", { slug: "editor_field", label: "Editor field", type: "string" });
		await registry.updateCollection("authors", {
			label: "Writers",
			labelSingular: "Writer",
			description: "Edited description",
			supports: ["drafts", "seo"],
			group: "My shop",
			sortOrder: 7,
			hidden: true,
			admin: { listColumns: ["name", "editor_field"], quickCreate: false },
			titleField: "editor_field",
		});
	};

	it("keeps the collection's label, supports, SEO flag, placement, visibility, admin config and title field when fields are added", async () => {
		const { registry, port } = await setup();
		await reconcileSchema(port, withoutRelations(RELATIONS_TEST_SCHEMA));
		await customise(registry);
		const before = await registry.getCollection("authors");

		const result = await reconcileSchema(port, RELATIONS_TEST_SCHEMA);
		expect(result.addedFields.filter((added) => added.collection === "authors")).toEqual([{ collection: "authors", field: "books" }]);
		expect(result.placedCollections).not.toContain("authors");

		const after = await registry.getCollection("authors");
		expect(after).toMatchObject({
			label: "Writers",
			labelSingular: "Writer",
			description: "Edited description",
			supports: ["drafts", "seo"],
			hasSeo: true,
			group: "My shop",
			sortOrder: 7,
			hidden: true,
			admin: { listColumns: ["name", "editor_field"], quickCreate: false },
			titleField: "editor_field",
		});
		expect(after).toEqual({ ...before, updatedAt: after!.updatedAt });
	});

	it("keeps an editor-changed field label and flags, and an editor-added field", async () => {
		const { registry, port } = await setup();
		await reconcileSchema(port, withoutRelations(RELATIONS_TEST_SCHEMA));
		await customise(registry);
		await reconcileSchema(port, RELATIONS_TEST_SCHEMA);
		const fields = await fieldsOf(registry, "authors");
		expect(fields.find((field) => field.slug === "name")).toMatchObject({ label: "Editor's label", searchable: true });
		expect(fields.find((field) => field.slug === "editor_field")).toMatchObject({ label: "Editor field" });
		expect(fields.map((field) => field.slug)).toEqual(expect.arrayContaining(["name", "editor_field", "books"]));
	});

	it("does not rewrite an existing field even when this release defines it differently", async () => {
		const { registry, port } = await setup();
		await reconcileSchema(port, withoutRelations(RELATIONS_TEST_SCHEMA));
		const changed: SchemaDefinitions = {
			...RELATIONS_TEST_SCHEMA,
			collections: RELATIONS_TEST_SCHEMA.collections.map((collection) => ({
				...collection,
				fields: collection.fields.map((field) => (field.slug === "name" ? { ...field, label: "New release label", indexed: true } : field)),
			})),
		};
		await reconcileSchema(port, changed);
		expect((await fieldsOf(registry, "authors")).find((field) => field.slug === "name")).toMatchObject({ label: "Name", indexed: false });
	});

	it("never re-hides or re-places a collection an admin placed, and applies hidden to one that is still unplaced", async () => {
		const { registry, port } = await setup();
		const schema: SchemaDefinitions = { ...RELATIONS_TEST_SCHEMA, collections: RELATIONS_TEST_SCHEMA.collections.map((collection) => ({ ...collection, hidden: true })) };
		await reconcileSchema(port, withoutRelations({ ...RELATIONS_TEST_SCHEMA }));
		await registry.updateCollection("books", { group: null, sortOrder: null, hidden: false });
		await registry.updateCollection("authors", { group: "Mine", sortOrder: 3, hidden: false });
		const result = await reconcileSchema(port, schema);
		expect(result.placedCollections).toContain("books");
		expect(result.placedCollections).not.toContain("authors");
		expect((await registry.getCollection("books"))!.hidden).toBe(true);
		expect(await registry.getCollection("authors")).toMatchObject({ hidden: false, group: "Mine", sortOrder: 3 });
	});
});

describe("applySeed onConflict update (the finding the reconciler is built on)", () => {
	const seedOf = (collection: Record<string, unknown>) => ({ version: "1", collections: [collection] }) as never;

	it("rewrites the collection row from the seed (label, supports, SEO) but touches no field the seed does not list", async () => {
		const { db, registry } = await setup();
		await applySeed(db as never, seedOf({ slug: "things", label: "Things", supports: ["drafts"], group: "G", sortOrder: 5, fields: [{ slug: "a", label: "A", type: "string" }] }), { onConflict: "skip" });
		await registry.updateField("things", "a", { label: "Editor A", searchable: true });
		await registry.createField("things", { slug: "editor_added", label: "Editor added", type: "string" });
		await registry.updateCollection("things", { label: "Editor Things", supports: ["drafts", "seo"], group: "Mine" });

		await applySeed(db as never, seedOf({ slug: "things", label: "Things", supports: ["drafts"], fields: [{ slug: "c", label: "C", type: "string" }] }), { onConflict: "update" });

		const collection = (await registry.getCollectionWithFields("things"))!;
		// Collection-level properties follow the seed: this is why registry-port.ts carries the stored ones in the seed.
		expect(collection).toMatchObject({ label: "Things", supports: ["drafts"], hasSeo: false });
		// Placement is untouched when the seed omits it; fields the seed does not list are untouched.
		expect(collection).toMatchObject({ group: "Mine", sortOrder: 5 });
		expect(collection.fields.find((field) => field.slug === "a")).toMatchObject({ label: "Editor A", searchable: true });
		expect(collection.fields.map((field) => field.slug)).toEqual(expect.arrayContaining(["a", "editor_added", "c"]));
	});

	it("rewrites the label of an existing field that the seed lists", async () => {
		const { db, registry } = await setup();
		await applySeed(db as never, seedOf({ slug: "things", label: "Things", fields: [{ slug: "a", label: "A", type: "string" }] }), { onConflict: "skip" });
		await registry.updateField("things", "a", { label: "Editor A" });
		await applySeed(db as never, seedOf({ slug: "things", label: "Things", fields: [{ slug: "a", label: "A", type: "string" }] }), { onConflict: "update" });
		expect((await fieldsOf(registry, "things")).find((field) => field.slug === "a")!.label).toBe("A");
	});

	it("validates admin.listColumns against the fields in the seed, so a partial seed cannot carry the stored list", async () => {
		const { db } = await setup();
		await applySeed(db as never, seedOf({ slug: "things", label: "Things", fields: [{ slug: "a", label: "A", type: "string" }] }), { onConflict: "skip" });
		await expect(
			applySeed(db as never, seedOf({ slug: "things", label: "Things", admin: { listColumns: ["a"] }, fields: [{ slug: "c", label: "C", type: "string" }] }), { onConflict: "update" }),
		).rejects.toThrow(/unknown field "a"/);
	});
});
