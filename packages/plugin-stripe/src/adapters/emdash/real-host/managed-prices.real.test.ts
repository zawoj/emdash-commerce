import { createContentAccessWithWrite, handleContentPublish, SchemaRegistry } from "emdash";
import { describe, expect, it } from "vitest";

import { commerceOptionsSchema } from "../../../contracts/options.js";
import { createContainer, resetContainerMemo } from "../../../plugin/container.js";
import { syncManagedPrices } from "../../../services/catalog/managed-prices.js";
import { createCatalogReadService } from "../../../services/catalog-read.js";
import { createReadySchemaPort } from "../../../testing/fakes/schema-port.js";
import { createFakePaymentProvider, createFakePluginContext } from "../../../testing/index.js";
import { requireWritableContent } from "../content/repositories.js";
import { createEmDashRelations } from "../relations/emdash-relations.js";
import { buildSchemaDefinitions } from "../schema/collections/index.js";
import { PRICE_FIELD, PRODUCT_FIELD, VARIANT_FIELD } from "../schema/field-names.js";
import { reconcileSchema } from "../schema/reconcile.js";
import { createRegistryPortFor } from "../schema/registry-port.js";
import { createRealDatabase } from "./host.js";

const options = commerceOptionsSchema.parse({ supportedCurrencies: ["pln"] });
const slugs = options.collections;
const schema = buildSchemaDefinitions(options);

/** Edits a product the way an editor does (staged in a draft revision) and publishes it, which is when the columns change. */
const editAndPublish = async (db: unknown, content: ReturnType<typeof requireWritableContent>, id: string, data: Record<string, unknown>) => {
	await content.update(slugs.products, id, data);
	const published = await handleContentPublish(db as never, slugs.products, id);
	if (!published.success) throw new Error("publish failed");
};

const setup = async () => {
	resetContainerMemo();
	const db = await createRealDatabase();
	await reconcileSchema(createRegistryPortFor(db as never), schema);
	const content = requireWritableContent(createContentAccessWithWrite(db as never, undefined, { revisions: true } as never));
	const relations = createEmDashRelations(async () => db as never);
	const make = async (collection: string, data: Record<string, unknown>, references: Record<string, string[]> = {}, status = "published") =>
		(await relations.createWithReferences(collection, { data, status }, references)).id;
	const ctx = createFakePluginContext(schema.collections);
	Object.assign(ctx, { content });
	const container = createContainer(ctx, options, {}, { createSchemaPort: async () => createReadySchemaPort(schema.collections), createProvider: () => createFakePaymentProvider(), relations, env: {} });
	const managed = async (kind: "product" | "variant", id: string) => {
		const links = await relations.children(kind === "product" ? slugs.products : slugs.variants, id, kind === "product" ? PRODUCT_FIELD.prices : VARIANT_FIELD.prices, { includeDrafts: true });
		const entries = await Promise.all(links.items.map((entry) => content.get(slugs.prices, entry.id)));
		return entries.filter((entry) => entry && entry.data[PRICE_FIELD.isManaged]);
	};
	return { db, content, relations, make, container, managed, registry: new SchemaRegistry(db as never) };
};

describe("managed prices on a real EmDash database", () => {
	it("creates one managed entry linked by a real relation, converges on replay and amount change, and archives on clear", async () => {
		const t = await setup();
		const product = await t.make(slugs.products, { [PRODUCT_FIELD.title]: "Mug", [PRODUCT_FIELD.price]: 1200, [PRODUCT_FIELD.sku]: "MUG" });
		await syncManagedPrices(t.container, { entity: "product", id: product });
		await syncManagedPrices(t.container, { entity: "product", id: product });
		await Promise.all([1, 2].map(() => syncManagedPrices(t.container, { entity: "product", id: product })));
		let entries = await t.managed("product", product);
		expect(entries).toHaveLength(1);
		expect(entries[0]!.data).toMatchObject({ [PRICE_FIELD.unitAmount]: 1200, [PRICE_FIELD.currency]: "pln", [PRICE_FIELD.type]: "one_time", [PRICE_FIELD.isActive]: 1, [PRICE_FIELD.isManaged]: 1 });
		const id = entries[0]!.id;
		expect(await t.container.catalog.getPrice(id)).toMatchObject({ productId: product, variantId: null, unitAmount: 1200, isManaged: true });

		// A product edit is a draft until published: the live price (and so the managed entry) does not move yet.
		await t.content.update(slugs.products, product, { [PRODUCT_FIELD.price]: 1500 });
		await syncManagedPrices(t.container, { entity: "product", id: product });
		expect((await t.managed("product", product))[0]!.data[PRICE_FIELD.unitAmount]).toBe(1200);
		await editAndPublish(t.db, t.content, product, { [PRODUCT_FIELD.price]: 1500 });
		await syncManagedPrices(t.container, { entity: "product", id: product });
		entries = await t.managed("product", product);
		expect(entries.map((entry) => [entry!.id, entry!.data[PRICE_FIELD.unitAmount]])).toEqual([[id, 1500]]);

		await editAndPublish(t.db, t.content, product, { [PRODUCT_FIELD.price]: null });
		await syncManagedPrices(t.container, { entity: "product", id: product });
		expect((await t.managed("product", product))[0]!.data[PRICE_FIELD.isActive]).toBe(0);
	});

	it("mirrors the product price into inheriting variants, keeps overrides, and serves the result through the storefront API", async () => {
		const t = await setup();
		const product = await t.make(slugs.products, { [PRODUCT_FIELD.title]: "Tee", [PRODUCT_FIELD.hasVariants]: true, [PRODUCT_FIELD.price]: 5000, [PRODUCT_FIELD.sku]: "TEE" });
		const a = await t.make(slugs.variants, { [VARIANT_FIELD.title]: "A", [VARIANT_FIELD.sku]: "TEE-A", [VARIANT_FIELD.isActive]: true }, { [VARIANT_FIELD.product]: [product] });
		const b = await t.make(slugs.variants, { [VARIANT_FIELD.title]: "B", [VARIANT_FIELD.sku]: "TEE-B", [VARIANT_FIELD.isActive]: true, [VARIANT_FIELD.price]: 6500 }, { [VARIANT_FIELD.product]: [product] });
		await syncManagedPrices(t.container, { entity: "product", id: product });
		expect((await t.managed("variant", a))[0]!.data[PRICE_FIELD.unitAmount]).toBe(5000);
		expect((await t.managed("variant", b))[0]!.data[PRICE_FIELD.unitAmount]).toBe(6500);
		expect(await t.managed("product", product)).toHaveLength(0);

		const detail = await createCatalogReadService(t.container).product((await t.content.get(slugs.products, product))!.slug!);
		expect(detail.variants.map((variant) => variant.price.amount).sort()).toEqual([5000, 6500]);
		expect(detail.price).toMatchObject({ amount: 5000, isRange: true });
		const { items } = await createCatalogReadService(t.container).products({});
		expect(items.map((item) => item.id)).toEqual([product]);
	});
});
