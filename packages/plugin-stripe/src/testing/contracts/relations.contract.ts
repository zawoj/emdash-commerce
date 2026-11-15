import { describe, expect, it } from "vitest";

import { RELATION_ERROR, RELATIONS_PAGE_SIZE, RelationError, type RelationsPort } from "../../adapters/emdash/relations/port.js";
import { relationField, type CollectionDefinition, type RelationDefinition, type SchemaDefinitions } from "../../adapters/emdash/schema/collections/index.js";
import { ADMIN_NAV_GROUP } from "../../adapters/emdash/constants.js";

/**
 * Test-only schema for the relations contract: an author with many books (a book has one author), shelves and
 * books in a many-to-many relation, a category tree (self relation), and reviews that must name their book.
 */
const collection = (slug: string, fields: CollectionDefinition["fields"]): CollectionDefinition => ({
	slug,
	label: slug,
	labelSingular: slug,
	description: slug,
	supports: [],
	routable: false,
	icon: "book",
	navigation: { group: ADMIN_NAV_GROUP.catalog, sortOrder: 1 },
	hidden: false,
	listColumns: ["name"],
	titleField: "name",
	isPluginOwned: false,
	fields: [{ slug: "name", label: "Name", type: "string" }, ...fields],
});

const relation = (slug: string, parentCollection: string, childCollection: string, maxChildrenPerParent: number | null, maxParentsPerChild: number | null): RelationDefinition => ({
	slug,
	parentCollection,
	childCollection,
	parentLabel: slug,
	childLabel: slug,
	maxChildrenPerParent,
	maxParentsPerChild,
});

export const RELATIONS_TEST_SCHEMA: SchemaDefinitions = {
	collections: [
		collection("authors", [relationField("books", "Books", "author_books", "parent", { multiple: true })]),
		collection("books", [
			relationField("author", "Author", "author_books", "child"),
			relationField("shelves", "Shelves", "shelf_books", "child", { multiple: true }),
			relationField("reviews", "Reviews", "book_reviews", "parent", { multiple: true }),
		]),
		collection("shelves", [relationField("books", "Books", "shelf_books", "parent", { multiple: true })]),
		collection("categories", [
			relationField("subcategories", "Subcategories", "category_tree", "parent", { multiple: true }),
			relationField("parent", "Parent", "category_tree", "child"),
		]),
		collection("reviews", [relationField("book", "Book", "book_reviews", "child", { required: true })]),
	],
	relations: [
		relation("author_books", "authors", "books", null, 1),
		relation("shelf_books", "shelves", "books", null, null),
		relation("category_tree", "categories", "categories", null, 1),
		relation("book_reviews", "books", "reviews", null, 1),
	],
};

export interface RelationsHarness {
	port: RelationsPort;
	/** Creates an entry (published unless told otherwise) and returns its id. */
	entry(collection: string, name: string, options?: { isPublished?: boolean }): Promise<string>;
	setPublished(collection: string, id: string, isPublished: boolean): Promise<void>;
}

const names = (items: Array<{ title: string | null }>): Array<string | null> => items.map((item) => item.title);
const live = { includeDrafts: false } as const;
const all = { includeDrafts: true } as const;

const expectError = async (promise: Promise<unknown>, kind: string): Promise<void> => {
	const error = await promise.then(
		() => null,
		(thrown: unknown) => thrown,
	);
	expect(error).toBeInstanceOf(RelationError);
	expect((error as RelationError).kind).toBe(kind);
};

export const relationsContract = (label: string, create: () => Promise<RelationsHarness>): void => {
	describe(`RelationsPort contract: ${label}`, () => {
		it("returns a parent's children in the order they were set, and replaces the whole set on every write", async () => {
			const { port, entry } = await create();
			const author = await entry("authors", "Tolkien");
			const [a, b, c] = [await entry("books", "A"), await entry("books", "B"), await entry("books", "C")] as [string, string, string];
			await port.setChildren("authors", author, "books", [c, a, b]);
			expect(names((await port.children("authors", author, "books", live)).items)).toEqual(["C", "A", "B"]);
			expect((await port.children("authors", author, "books", live)).items.map((item) => item.sortOrder)).toEqual([0, 1, 2]);
			await port.setChildren("authors", author, "books", [b]);
			expect(names((await port.children("authors", author, "books", live)).items)).toEqual(["B"]);
			expect(await port.parentOf("books", a, "author", live)).toBeNull();
			await port.setChildren("authors", author, "books", []);
			expect((await port.children("authors", author, "books", live)).items).toEqual([]);
		});

		it("keeps both ends of a relation in step: the child side reads its parent, and setting it from there updates the parent", async () => {
			const { port, entry } = await create();
			const [one, two] = [await entry("authors", "One"), await entry("authors", "Two")] as [string, string];
			const book = await entry("books", "Book");
			await port.setChildren("authors", one, "books", [book]);
			expect(await port.parentOf("books", book, "author", live)).toMatchObject({ id: one, collection: "authors", title: "One", sortOrder: 0 });
			const second = await entry("books", "Second");
			await port.setChildren("authors", two, "books", [second]);
			await port.setParent("books", book, "author", two);
			expect((await port.children("authors", one, "books", live)).items).toEqual([]);
			expect(names((await port.children("authors", two, "books", live)).items)).toEqual(["Second", "Book"]);
			expect(await port.parentOf("books", book, "author", live)).toMatchObject({ id: two, sortOrder: 1 });
			await port.setParent("books", book, "author", null);
			expect(await port.parentOf("books", book, "author", live)).toBeNull();
			expect(names((await port.children("authors", two, "books", live)).items)).toEqual(["Second"]);
		});

		it("supports many-to-many: a book on several shelves, a shelf with several books", async () => {
			const { port, entry } = await create();
			const [s1, s2] = [await entry("shelves", "S1"), await entry("shelves", "S2")] as [string, string];
			const book = await entry("books", "Book");
			await port.setChildren("books", book, "shelves", [s2, s1]);
			// A child's parents have no meaningful order (EmDash lists them by edge id), so compare as a set.
			expect(names((await port.children("books", book, "shelves", live)).items).sort()).toEqual(["S1", "S2"]);
			expect(names((await port.children("shelves", s1, "books", live)).items)).toEqual(["Book"]);
			await port.setChildren("shelves", s2, "books", []);
			expect(names((await port.children("books", book, "shelves", live)).items)).toEqual(["S1"]);
		});

		it("supports a self relation: a category tree", async () => {
			const { port, entry } = await create();
			const [root, child] = [await entry("categories", "Root"), await entry("categories", "Child")] as [string, string];
			await port.setChildren("categories", root, "subcategories", [child]);
			expect(await port.parentOf("categories", child, "parent", live)).toMatchObject({ id: root, title: "Root" });
			expect(names((await port.children("categories", root, "subcategories", live)).items)).toEqual(["Child"]);
			expect(await port.parentOf("categories", root, "parent", live)).toBeNull();
		});

		it("refuses a selection that breaks the relation's limits, leaving the old set intact", async () => {
			const { port, entry } = await create();
			const [one, two] = [await entry("authors", "One"), await entry("authors", "Two")] as [string, string];
			const book = await entry("books", "Book");
			await port.setChildren("authors", one, "books", [book]);
			await expectError(port.setChildren("authors", two, "books", [book]), RELATION_ERROR.invalid);
			expect(names((await port.children("authors", one, "books", live)).items)).toEqual(["Book"]);
			expect((await port.children("authors", two, "books", live)).items).toEqual([]);
			await expectError(port.setChildren("books", book, "author", [one, two]), RELATION_ERROR.invalid);
		});

		it("lets an author re-save the set it already holds (its own links do not count against the far limit)", async () => {
			const { port, entry } = await create();
			const author = await entry("authors", "One");
			const book = await entry("books", "Book");
			await port.setChildren("authors", author, "books", [book]);
			await port.setChildren("authors", author, "books", [book]);
			expect(names((await port.children("authors", author, "books", live)).items)).toEqual(["Book"]);
		});

		it("fails with typed errors: unknown entries are notFound, a field that is not a relation is invalid", async () => {
			const { port, entry } = await create();
			const author = await entry("authors", "One");
			await expectError(port.setChildren("authors", author, "books", ["missing"]), RELATION_ERROR.notFound);
			await expectError(port.setChildren("authors", "missing", "books", []), RELATION_ERROR.notFound);
			await expectError(port.children("authors", "missing", "books", live), RELATION_ERROR.notFound);
			await expectError(port.children("authors", author, "name", live), RELATION_ERROR.invalid);
			await expectError(port.setChildren("authors", author, "name", []), RELATION_ERROR.invalid);
		});

		it("hides unpublished entries on a live read and shows them on a draft-aware one", async () => {
			const { port, entry, setPublished } = await create();
			const author = await entry("authors", "One");
			const [pub, draft] = [await entry("books", "Published"), await entry("books", "Draft", { isPublished: false })] as [string, string];
			await port.setChildren("authors", author, "books", [draft, pub]);
			expect(names((await port.children("authors", author, "books", live)).items)).toEqual(["Published"]);
			expect(names((await port.children("authors", author, "books", all)).items)).toEqual(["Draft", "Published"]);
			expect(await port.parentOf("books", draft, "author", live)).toMatchObject({ title: "One" });
			await setPublished("books", draft, true);
			expect(names((await port.children("authors", author, "books", live)).items)).toEqual(["Draft", "Published"]);
		});

		it("returns one page and says when more links exist; a limit cuts the page and reports it", async () => {
			const { port, entry } = await create();
			const shelf = await entry("shelves", "Big");
			const books: string[] = [];
			for (let index = 0; index < RELATIONS_PAGE_SIZE + 5; index += 1) books.push(await entry("books", `Book ${index}`));
			await port.setChildren("shelves", shelf, "books", books);
			const page = await port.children("shelves", shelf, "books", all);
			expect(page.items).toHaveLength(RELATIONS_PAGE_SIZE);
			expect(page.hasMore).toBe(true);
			expect(page.items[0]!.title).toBe("Book 0");
			const small = await port.children("shelves", shelf, "books", { ...all, limit: 3 });
			expect(names(small.items)).toEqual(["Book 0", "Book 1", "Book 2"]);
			expect(small.hasMore).toBe(true);
			await port.setChildren("shelves", shelf, "books", books.slice(0, 3));
			expect((await port.children("shelves", shelf, "books", { ...all, limit: 3 })).hasMore).toBe(false);
		});

		it("creates an entry together with its links, and refuses to create one that lacks a required link", async () => {
			const { port, entry } = await create();
			const book = await entry("books", "Book");
			const { id } = await port.createWithReferences("reviews", { data: { name: "Great" }, status: "published" }, { book: [book] });
			expect(await port.parentOf("reviews", id, "book", all)).toMatchObject({ id: book, title: "Book" });
			expect(names((await port.children("books", book, "reviews", all)).items)).toEqual(["Great"]);
			await expectError(port.createWithReferences("reviews", { data: { name: "Orphan" }, status: "published" }, {}), RELATION_ERROR.invalid);
			await expectError(port.createWithReferences("reviews", { data: { name: "Orphan" }, status: "published" }, { book: ["missing"] }), RELATION_ERROR.notFound);
			await expectError(port.setParent("reviews", id, "book", null), RELATION_ERROR.invalid);
		});
	});
};
