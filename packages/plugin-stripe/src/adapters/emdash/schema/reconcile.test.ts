import { beforeEach, describe, expect, it } from "vitest";

import { commerceOptionsSchema } from "../../../contracts/options.js";
import { createMemorySchemaPort } from "../../../testing/fakes/schema-port.js";
import { createFakeKv } from "../../../testing/fakes/storage.js";
import { KV_KEY } from "../constants.js";
import { ADMIN_NAV_GROUP } from "../constants.js";
import { buildCollectionDefinitions, buildSchemaDefinitions, relationField, type CollectionDefinition, type RelationDefinition, type SchemaDefinitions } from "./collections/index.js";
import {
	ensureSchema,
	fingerprintDefinitions,
	reconcileSchema,
	resetEnsureSchemaMemo,
	type SchemaPort,
} from "./reconcile.js";

const options = commerceOptionsSchema.parse({});
const definitions = buildCollectionDefinitions(options.collections, options.supportedCurrencies);
/** What `ensureSchema` fingerprints: the collections together with their relations. */
const schema = buildSchemaDefinitions(options);

const createFakePort = createMemorySchemaPort;

const ctxWith = (kv = createFakeKv()) => ({ kv, log: { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined } });

beforeEach(() => resetEnsureSchemaMemo());

describe("reconcileSchema", () => {
	it("creates every missing collection on an empty database", async () => {
		const port = createFakePort();
		const result = await reconcileSchema(port, definitions);
		expect(result.createdCollections).toHaveLength(definitions.length);
		expect(result.addedFields).toEqual([]);
		expect(port.plans).toHaveLength(1);
		expect(port.schema.get("orders")!.has("order_number")).toBe(true);
	});

	it("adds only the missing fields to an existing collection and never touches the rest", async () => {
		const products = definitions[0]!;
		const existing = Object.fromEntries(definitions.map((definition) => [definition.slug, definition.fields.map((field) => field.slug)]));
		existing[products.slug] = ["title", "price", "currency"]; // an old release plus an editor's custom field
		const placed = Object.fromEntries(definitions.map((definition) => [definition.slug, definition.navigation]));
		const port = createFakePort(existing, placed);
		const result = await reconcileSchema(port, definitions);
		expect(result.createdCollections).toEqual([]);
		expect(result.addedFields.every((entry) => entry.collection === products.slug)).toBe(true);
		expect(result.addedFields.map((entry) => entry.field)).toContain("has_variants");
		expect(result.addedFields.map((entry) => entry.field)).not.toContain("title");
		expect(port.calls.filter((call) => call !== "apply").every((call) => call.startsWith("add:"))).toBe(true);
		expect(port.plans[0]!.create).toEqual([]);
		expect(port.schema.get(products.slug)!.has("price")).toBe(true);
	});

	it("is idempotent: a second run changes nothing", async () => {
		const port = createFakePort();
		await reconcileSchema(port, definitions);
		const callsAfterFirst = port.calls.length;
		const second = await reconcileSchema(port, definitions);
		expect(second).toEqual({ createdCollections: [], createdRelations: [], addedFields: [], placedCollections: [] });
		expect(port.calls).toHaveLength(callsAfterFirst);
	});

	it("creates collections already in their sidebar folders: catalog first, then sales in handling order", async () => {
		const port = createFakePort();
		await reconcileSchema(port, definitions);
		const sidebar = [...port.navigation].sort(([, a], [, b]) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
		const placedAs = sidebar.map(([slug, placed]) => `${placed.group}/${slug}`);
		expect(placedAs.filter((entry) => entry.startsWith("Catalog/"))).toEqual([
			"Catalog/products",
			"Catalog/product_types",
			"Catalog/attributes",
			"Catalog/brands",
			"Catalog/product_categories",
			"Catalog/product_variants",
			"Catalog/attribute_values",
			"Catalog/prices",
		]);
		expect(placedAs.filter((entry) => entry.startsWith("Sales/")).slice(0, 5)).toEqual(["Sales/orders", "Sales/customers", "Sales/subscriptions", "Sales/payments", "Sales/carts"]);
		expect(placedAs.slice(0, 8).every((entry) => entry.startsWith("Catalog/"))).toBe(true);
	});

	it("places existing collections that an older release left without a folder", async () => {
		const existing = Object.fromEntries(definitions.map((definition) => [definition.slug, definition.fields.map((field) => field.slug)]));
		const port = createFakePort(existing);
		const result = await reconcileSchema(port, definitions);
		expect(result.placedCollections).toEqual(definitions.map((definition) => definition.slug));
		expect(port.navigation.get("orders")).toEqual({ group: ADMIN_NAV_GROUP.sales, sortOrder: 1010 });
		expect(port.calls.every((call) => call.startsWith("place:"))).toBe(true);
	});

	it("keeps the placement of a collection an admin has already put somewhere, even only a position", async () => {
		const existing = Object.fromEntries(definitions.map((definition) => [definition.slug, definition.fields.map((field) => field.slug)]));
		const port = createFakePort(existing, { orders: { group: "Shop", sortOrder: null }, carts: { group: null, sortOrder: 3 } });
		const result = await reconcileSchema(port, definitions);
		expect(result.placedCollections).not.toContain("orders");
		expect(result.placedCollections).not.toContain("carts");
		expect(port.navigation.get("orders")).toEqual({ group: "Shop", sortOrder: null });
		expect(port.navigation.get("carts")).toEqual({ group: null, sortOrder: 3 });
		expect(port.navigation.get("payments")).toEqual({ group: ADMIN_NAV_GROUP.sales, sortOrder: 1013 });
	});
});

describe("ensureSchema", () => {
	const deps = (port: SchemaPort, extra: Record<string, unknown> = {}) => ({ createPort: async () => port, sleep: async () => undefined, ...extra });

	it("reconciles once, stores the marker and skips the database on the next call", async () => {
		const port = createFakePort();
		const ctx = ctxWith();
		let ports = 0;
		const createPort = async () => {
			ports += 1;
			return port;
		};
		await ensureSchema(ctx, options, { createPort });
		await ensureSchema(ctx, options, { createPort });
		expect(ports).toBe(1);
		expect(await ctx.kv.get(KV_KEY.schemaMarker)).toBe(await fingerprintDefinitions(schema));
		expect(await ctx.kv.get(KV_KEY.schemaLock)).toBeNull();
	});

	it("skips the database entirely on a warm start (marker already current), in a fresh process", async () => {
		const ctx = ctxWith();
		await ctx.kv.set(KV_KEY.schemaMarker, await fingerprintDefinitions(schema));
		let ports = 0;
		await ensureSchema(ctx, options, {
			createPort: async () => {
				ports += 1;
				return createFakePort();
			},
		});
		expect(ports).toBe(0);
	});

	it("re-reconciles when the definitions change (a new release adds a field)", async () => {
		const port = createFakePort();
		const ctx = ctxWith();
		await ensureSchema(ctx, options, deps(port));
		resetEnsureSchemaMemo();
		const next = commerceOptionsSchema.parse({ collections: { carts: "shop_carts" } });
		await ensureSchema(ctx, next, deps(port));
		expect(port.schema.has("shop_carts")).toBe(true);
	});

	it("shares one run between concurrent callers in a process", async () => {
		const port = createFakePort();
		const ctx = ctxWith();
		let ports = 0;
		const createPort = async () => {
			ports += 1;
			return port;
		};
		await Promise.all([ensureSchema(ctx, options, { createPort }), ensureSchema(ctx, options, { createPort }), ensureSchema(ctx, options, { createPort })]);
		expect(ports).toBe(1);
	});

	it("serialises two processes with the KV lock: the loser waits for the winner's marker", async () => {
		const kv = createFakeKv();
		const winnerPort = createFakePort();
		const loserPort = createFakePort();
		let now = 0;
		const base = { now: () => now, sleep: async () => void (now += 250) };
		// Process A holds the lock and finishes after a few polls; process B (a separate memo) must not create anything.
		const fingerprint = await fingerprintDefinitions(schema);
		await kv.set(KV_KEY.schemaLock, { holder: "A", expiresAt: 60_000 });
		let polls = 0;
		const loser = ensureSchema(ctxWith(kv), options, {
			...base,
			createPort: async () => loserPort,
			sleep: async () => {
				polls += 1;
				now += 250;
				if (polls === 3) await kv.set(KV_KEY.schemaMarker, fingerprint);
			},
		});
		await loser;
		expect(polls).toBe(3);
		expect(loserPort.calls).toEqual([]);
		expect(winnerPort.calls).toEqual([]);
	});

	it("takes over a lock whose holder died", async () => {
		const kv = createFakeKv();
		const port = createFakePort();
		await kv.set(KV_KEY.schemaLock, { holder: "dead", expiresAt: 1000 });
		await ensureSchema(ctxWith(kv), options, { createPort: async () => port, now: () => 5000, sleep: async () => undefined });
		expect(port.schema.size).toBe(definitions.length);
		expect(await kv.get(KV_KEY.schemaLock)).toBeNull();
	});

	it("gives up waiting for a live lock after the timeout", async () => {
		const kv = createFakeKv();
		let now = 0;
		await kv.set(KV_KEY.schemaLock, { holder: "slow", expiresAt: 10_000_000 });
		await expect(
			ensureSchema(ctxWith(kv), options, { createPort: async () => createFakePort(), now: () => now, sleep: async () => void (now += 5000) }),
		).rejects.toThrow(/Timed out/);
	});

	it("releases the lock, leaves the marker unset and allows a retry after a failure", async () => {
		const port = createFakePort();
		port.failOn = "orders";
		const ctx = ctxWith();
		await expect(ensureSchema(ctx, options, deps(port))).rejects.toThrow("database is locked");
		expect(await ctx.kv.get(KV_KEY.schemaLock)).toBeNull();
		expect(await ctx.kv.get(KV_KEY.schemaMarker)).toBeNull();
		port.failOn = null;
		await ensureSchema(ctx, options, deps(port));
		expect(await ctx.kv.get(KV_KEY.schemaMarker)).not.toBeNull();
		expect(port.schema.get("orders")).toBeDefined();
	});

	it("does not release a lock another process took over meanwhile", async () => {
		const kv = createFakeKv();
		const port = createFakePort();
		const base = createFakePort();
		port.apply = async (plan) => {
			await base.apply(plan);
			await kv.set(KV_KEY.schemaLock, { holder: "other", expiresAt: Number.MAX_SAFE_INTEGER });
		};
		await ensureSchema(ctxWith(kv), options, deps(port));
		expect(((await kv.get(KV_KEY.schemaLock)) as { holder: string }).holder).toBe("other");
	});
});

describe("fingerprintDefinitions", () => {
	it("changes with the fields and ignores labels", async () => {
		const original = await fingerprintDefinitions(definitions);
		const relabelled = definitions.map((definition) => ({ ...definition, label: `${definition.label}!` }));
		expect(await fingerprintDefinitions(relabelled)).toBe(original);
		const extra = definitions.map((definition, index) => (index === 0 ? { ...definition, fields: [...definition.fields, { slug: "extra", label: "Extra", type: "string" as const }] } : definition));
		expect(await fingerprintDefinitions(extra)).not.toBe(original);
	});

	it("changes when a collection moves in the sidebar, so existing databases get the new placement once", async () => {
		const original = await fingerprintDefinitions(definitions);
		const regrouped = definitions.map((definition, index) => (index === 0 ? { ...definition, navigation: { ...definition.navigation, group: ADMIN_NAV_GROUP.sales } } : definition));
		expect(await fingerprintDefinitions(regrouped)).not.toBe(original);
		const reordered = definitions.map((definition, index) => (index === 0 ? { ...definition, navigation: { ...definition.navigation, sortOrder: 1 } } : definition));
		expect(await fingerprintDefinitions(reordered)).not.toBe(original);
	});
});

/** Test-only definitions: authors (parent) with many books (child), and a hidden helper collection. */
const testSchema = (overrides: { hidden?: boolean } = {}): SchemaDefinitions => {
	const base = definitions[0]!;
	const collection = (slug: string, fields: CollectionDefinition["fields"], hidden = false): CollectionDefinition => ({
		...base,
		slug,
		label: slug,
		labelSingular: slug,
		routable: false,
		supports: [],
		hidden,
		listColumns: ["name"],
		titleField: "name",
		fields,
	});
	const relation: RelationDefinition = {
		slug: "author_books",
		parentCollection: "authors",
		childCollection: "books",
		parentLabel: "Author",
		childLabel: "Books",
		maxChildrenPerParent: null,
		maxParentsPerChild: 1,
	};
	return {
		collections: [
			collection("authors", [{ slug: "name", label: "Name", type: "string" }, relationField("books", "Books", "author_books", "parent", { multiple: true })]),
			collection("books", [{ slug: "name", label: "Name", type: "string" }, relationField("author", "Author", "author_books", "child")], overrides.hidden ?? true),
		],
		relations: [relation],
	};
};

describe("reconcileSchema with relations", () => {
	it("creates the relation and both collections in one plan, so bound fields find their relation", async () => {
		const port = createFakePort();
		const result = await reconcileSchema(port, testSchema());
		expect(result).toEqual({ createdCollections: ["authors", "books"], createdRelations: ["author_books"], addedFields: [], placedCollections: [] });
		expect(port.plans).toHaveLength(1);
		expect(port.plans[0]!.relations.map((relation) => relation.slug)).toEqual(["author_books"]);
		expect(port.calls).toEqual(["apply", "relation:author_books", "create:authors", "create:books"]);
		expect(port.relations.has("author_books")).toBe(true);
	});

	it("creates a hidden collection hidden and a visible one visible", async () => {
		const port = createFakePort();
		await reconcileSchema(port, testSchema());
		expect(port.hidden.get("books")).toBe(true);
		expect(port.hidden.get("authors")).toBe(false);
	});

	it("gives an existing collection only the relation field it lacks, and creates the relation once", async () => {
		const placed = { group: "Catalog", sortOrder: 1 };
		const port = createFakePort({ authors: ["name"], books: ["name"] }, { authors: placed, books: placed });
		const result = await reconcileSchema(port, testSchema());
		expect(result).toEqual({
			createdCollections: [],
			createdRelations: ["author_books"],
			addedFields: [
				{ collection: "authors", field: "books" },
				{ collection: "books", field: "author" },
			],
			placedCollections: [],
		});
		const again = await reconcileSchema(port, testSchema());
		expect(again).toEqual({ createdCollections: [], createdRelations: [], addedFields: [], placedCollections: [] });
	});

	it("does not recreate a relation that exists", async () => {
		const placed = { group: "Catalog", sortOrder: 1 };
		const port = createFakePort({ authors: ["name"], books: ["name"] }, { authors: placed, books: placed }, ["author_books"]);
		const result = await reconcileSchema(port, testSchema());
		expect(result.createdRelations).toEqual([]);
		expect(port.plans[0]!.relations).toEqual([]);
		expect(result.addedFields).toHaveLength(2);
	});

	it("applies `hidden` to an unplaced existing collection together with its placement, and never to a placed one", async () => {
		const placed = { group: "Mine", sortOrder: 7 };
		const port = createFakePort({ authors: ["name", "books"], books: ["name", "author"] }, { authors: placed });
		port.relations.add("author_books");
		const result = await reconcileSchema(port, testSchema());
		expect(result.placedCollections).toEqual(["books"]);
		expect(port.hidden.get("books")).toBe(true);
		expect(port.hidden.has("authors")).toBe(false);
		expect(port.navigation.get("authors")).toEqual(placed);
	});

	it("does not touch a placed existing collection an editor un-hid", async () => {
		const placed = { group: "Catalog", sortOrder: 1 };
		const port = createFakePort({ authors: ["name", "books"], books: ["name", "author"] }, { authors: placed, books: placed }, ["author_books"]);
		const result = await reconcileSchema(port, testSchema({ hidden: true }));
		expect(result).toEqual({ createdCollections: [], createdRelations: [], addedFields: [], placedCollections: [] });
		expect(port.calls).toEqual([]);
	});

	it("still accepts a plain list of collections (no relations)", async () => {
		const port = createFakePort();
		const result = await reconcileSchema(port, definitions);
		expect(result.createdRelations).toEqual([]);
		expect(result.createdCollections).toHaveLength(definitions.length);
	});
});

describe("fingerprintDefinitions with relations and visibility", () => {
	it("is the same for the collections alone and for the same collections with no relations, and differs once relations are included", async () => {
		expect(await fingerprintDefinitions(definitions)).toBe(await fingerprintDefinitions({ collections: definitions, relations: [] }));
		expect(await fingerprintDefinitions(definitions)).not.toBe(await fingerprintDefinitions(buildSchemaDefinitions(options)));
	});

	it("changes when a relation is added, removed or re-limited", async () => {
		const schema = testSchema();
		const original = await fingerprintDefinitions(schema);
		expect(await fingerprintDefinitions({ ...schema, relations: [] })).not.toBe(original);
		expect(await fingerprintDefinitions({ ...schema, relations: [{ ...schema.relations[0]!, maxParentsPerChild: null }] })).not.toBe(original);
		expect(await fingerprintDefinitions({ ...schema, relations: [{ ...schema.relations[0]!, childLabel: "Titles" }] })).toBe(original);
	});

	it("changes when a field binds to another relation or side, or a collection becomes hidden", async () => {
		const schema = testSchema({ hidden: false });
		const original = await fingerprintDefinitions(schema);
		const rebound = {
			...schema,
			collections: schema.collections.map((definition) =>
				definition.slug === "books" ? { ...definition, fields: [definition.fields[0]!, relationField("author", "Author", "other_relation", "child")] } : definition,
			),
		};
		expect(await fingerprintDefinitions(rebound)).not.toBe(original);
		expect(await fingerprintDefinitions(testSchema({ hidden: true }))).not.toBe(original);
	});
});
