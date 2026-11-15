import { SchemaRegistry, createContentAccessWithWrite } from "emdash";
import { describe, expect, it } from "vitest";

import { commerceOptionsSchema } from "../../../contracts/options.js";
import { createFixedClock, createNullLogger } from "../../../testing/clock.js";
import { createInMemoryRecordIndex } from "../../../testing/in-memory/record-index.js";
import { createCartMirror, requireWritableContent } from "../content/repositories.js";
import { buildSchemaDefinitions } from "../schema/collections.js";
import { reconcileSchema } from "../schema/reconcile.js";
import { createRegistryPortFor } from "../schema/registry-port.js";
import { createRealDatabase } from "./host.js";

const options = commerceOptionsSchema.parse({ supportedCurrencies: ["pln", "eur"] });
const slugs = options.collections;
/** The collections together with the relations their fields bind to (what `ensureSchema` reconciles). */
const definitions = buildSchemaDefinitions(options);
const log = createNullLogger();

const db = await createRealDatabase();
const registry = new SchemaRegistry(db as never);
const port = createRegistryPortFor(db as never);

describe("schema reconciler on EmDash's SchemaRegistry", () => {
	it("creates all collections with the intended shape, then changes nothing on a second run", async () => {
		const first = await reconcileSchema(port, definitions);
		expect(first.createdCollections).toHaveLength(definitions.collections.length);
		expect(await reconcileSchema(port, definitions)).toEqual({ createdCollections: [], createdRelations: [], addedFields: [], placedCollections: [] });

		const collections = new Map((await registry.listCollectionsWithFields()).map((collection) => [collection.slug, collection]));
		const products = collections.get("products")!;
		expect(products).toMatchObject({ routable: true, urlPattern: "/shop/{slug}", hasSeo: true });
		expect(products.supports).toEqual(expect.arrayContaining(["drafts", "revisions", "seo"]));
		const orders = collections.get("orders")!;
		expect(orders).toMatchObject({ routable: false, titleField: "order_number" });
		expect(orders.admin).toMatchObject({ quickCreate: false, listColumns: ["order_status", "payment_status", "fulfillment_status", "total_amount"] });
		// The customer link is a native relation field (child side), not a text column holding an id.
		const customerLink = orders.fields.find((field) => field.slug === "customer")!;
		expect(customerLink).toMatchObject({ type: "reference", validation: { relation: "order_customer", relationSide: "child" } });
		expect(orders.fields.find((field) => field.slug === "lines")).toMatchObject({ type: "repeater" });
		expect(orders.fields.find((field) => field.slug === "line_items")).toBeUndefined();
		// Helper collections live inside their parent, off the sidebar.
		for (const hidden of ["payments", "order_events", "carts"]) expect(collections.get(hidden)).toMatchObject({ hidden: true });
		for (const visible of ["orders", "customers", "subscriptions"]) expect(collections.get(visible)?.hidden).toBeFalsy();
		expect(orders.fields.find((field) => field.slug === "order_number")).toMatchObject({ unique: true, indexed: true, required: true });
		expect(products).toMatchObject({ group: "Catalog", sortOrder: 1000 });
		expect(orders).toMatchObject({ group: "Sales", sortOrder: 1010 });
	});

	it("places a collection an older release created without a folder, and leaves an admin's placement alone", async () => {
		await registry.updateCollection("payments", { group: null, sortOrder: null });
		await registry.updateCollection("carts", { group: "Shop", sortOrder: null });
		const result = await reconcileSchema(port, definitions);
		expect(result).toEqual({ createdCollections: [], createdRelations: [], addedFields: [], placedCollections: ["payments"] });
		expect(await registry.getCollectionWithFields("payments")).toMatchObject({ group: "Sales", sortOrder: 1013 });
		expect((await registry.getCollectionWithFields("carts"))?.group).toBe("Shop");
	});

	it("rewrites an existing field's validation through the port, and reports a missing field", async () => {
		await registry.updateField("attributes", "input_type", { validation: { options: ["select"] } });
		const intended = definitions.collections.find((definition) => definition.slug === "attributes")!.fields.find((field) => field.slug === "input_type")!.validation!;
		expect(await port.setFieldValidation("attributes", "input_type", intended)).toBe(true);
		const stored = (await registry.getCollectionWithFields("attributes"))!.fields.find((field) => field.slug === "input_type")!;
		expect(stored.validation?.options).toEqual(intended.options);
		expect(await port.setFieldValidation("attributes", "no_such_field", intended)).toBe(false);
	});

	it("adds a field that an older release did not have, leaving existing ones alone", async () => {
		await registry.deleteField("orders", "notes");
		const result = await reconcileSchema(port, definitions);
		expect(result).toEqual({ createdCollections: [], createdRelations: [], addedFields: [{ collection: "orders", field: "notes" }], placedCollections: [] });
		const notes = (await registry.getCollectionWithFields("orders"))!.fields.find((field) => field.slug === "notes");
		expect(notes?.type).toBe("text");
	});

});

describe("cart mirror on EmDash's content access", () => {
	const content = requireWritableContent(createContentAccessWithWrite(db as never));

	it("keeps one admin mirror entry per cart", async () => {
		const mirror = createCartMirror(content, slugs, createInMemoryRecordIndex(createFixedClock()), log);
		const cart = { id: "m".repeat(32), status: "active" as const, lines: [{ priceId: "pr1", quantity: 1, addedAt: "2026-01-15T12:00:00.000Z" }], email: null, checkout: null, orderId: null, context: { userAgent: null, country: null }, createdAt: "2026-01-15T12:00:00.000Z", updatedAt: "2026-01-15T12:00:00.000Z", expiresAt: "2026-02-15T12:00:00.000Z" };
		await Promise.all(Array.from({ length: 4 }, () => mirror.upsert(cart, { itemCount: 1, subtotal: 1000, currency: "pln", lines: [] })));
		await mirror.upsert({ ...cart, email: "z@z.z" }, { itemCount: 1, subtotal: 1000, currency: "pln", lines: [] });
		const listed = await content.list(slugs.carts, { where: { fieldFilters: { cart_id: cart.id } } });
		expect(listed.items).toHaveLength(1);
		expect(listed.items[0]!.data.email).toBe("z@z.z");
	});
});
