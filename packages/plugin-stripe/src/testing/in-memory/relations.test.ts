import { describe, expect, it } from "vitest";

import { RELATION_ERROR, RelationError } from "../../adapters/emdash/relations/port.js";
import { relationsContract, RELATIONS_TEST_SCHEMA } from "../contracts/relations.contract.js";
import { createInMemoryRelations } from "./relations.js";

relationsContract("in memory", async () => {
	const relations = createInMemoryRelations(RELATIONS_TEST_SCHEMA);
	let next = 0;
	return {
		port: relations,
		entry: async (collection, name, options = {}) => {
			next += 1;
			const id = `${collection}-${next}`;
			relations.registerEntry(collection, id, { title: name, isPublished: options.isPublished ?? true });
			return id;
		},
		setPublished: async (collection, id, isPublished) => relations.setPublished(collection, id, isPublished),
	};
});

describe("in-memory relations: own behaviour", () => {
	it("reads entries from a supplied lookup (a fake content store) and exposes the stored edges", async () => {
		const known = new Map([["authors:a1", "Ann"], ["books:b1", "One"], ["books:b2", "Two"]]);
		const relations = createInMemoryRelations(RELATIONS_TEST_SCHEMA, {
			lookup: (collection, id) => (known.has(`${collection}:${id}`) ? { slug: id, title: known.get(`${collection}:${id}`)!, isPublished: true } : null),
		});
		await relations.setChildren("authors", "a1", "books", ["b2", "b1"]);
		expect(relations.edges("author_books")).toEqual([{ parent: "a1", child: "b2" }, { parent: "a1", child: "b1" }]);
		await expect(relations.setChildren("authors", "a1", "books", ["nope"])).rejects.toMatchObject({ kind: RELATION_ERROR.notFound });
		expect(relations.edges("author_books")).toHaveLength(2);
	});

	it("rejects a reference to a field of another collection with a RelationError", async () => {
		const relations = createInMemoryRelations(RELATIONS_TEST_SCHEMA);
		relations.registerEntry("authors", "a1");
		const error = await relations.children("authors", "a1", "author", { includeDrafts: true }).catch((thrown: unknown) => thrown);
		expect(error).toBeInstanceOf(RelationError);
	});

	it("reads several fields in one call with the limit applied per field, like the host's single read", async () => {
		const relations = createInMemoryRelations(RELATIONS_TEST_SCHEMA);
		relations.registerEntry("authors", "a1");
		for (const id of ["b1", "b2"]) relations.registerEntry("books", id);
		await relations.setChildren("authors", "a1", "books", ["b1", "b2"]);
		const read = await relations.fields("authors", "a1", ["books"], { includeDrafts: true, limit: 1 });
		expect(read.books!.items.map((entry) => entry.id)).toEqual(["b1"]);
		expect(read.books!.hasMore).toBe(true);
		await expect(relations.fields("authors", "a1", ["books", "author"], { includeDrafts: true })).rejects.toBeInstanceOf(RelationError);
	});
});
