import { createContentAccessWithWrite, handleContentDelete } from "emdash";
import { describe, expect, it } from "vitest";

import { commerceOptionsSchema } from "../../../contracts/options.js";
import { createContainer, resetContainerMemo } from "../../../plugin/container.js";
import { priceEntityKey, variantEntityKey } from "../../../services/catalog/entity-keys.js";
import { syncManagedPrices } from "../../../services/catalog/managed-prices.js";
import { createCatalogSyncService } from "../../../services/catalog-sync.js";
import { createEventPublisher } from "../../../services/outbox.js";
import { createReadySchemaPort } from "../../../testing/fakes/schema-port.js";
import { createFakePaymentProvider, createFakePluginContext } from "../../../testing/index.js";
import { createEmDashRelations } from "../relations/emdash-relations.js";
import { requireWritableContent } from "../content/repositories.js";
import { buildSchemaDefinitions } from "../schema/collections/index.js";
import { PRICE_FIELD, PRODUCT_FIELD, VARIANT_FIELD } from "../schema/field-names.js";
import { reconcileSchema } from "../schema/reconcile.js";
import { createRegistryPortFor } from "../schema/registry-port.js";
import { createRealDatabase } from "./host.js";

const options = commerceOptionsSchema.parse({ supportedCurrencies: ["pln"] });
const slugs = options.collections;
const FAR_FUTURE = "2999-01-01T00:00:00.000Z";

/** EmDash's own SQLite and content/relation code with the fake Stripe provider: the trash path as the content API runs it. */
const setup = async () => {
	resetContainerMemo();
	const db = await createRealDatabase();
	await reconcileSchema(createRegistryPortFor(db as never), buildSchemaDefinitions(options));
	const content = requireWritableContent(createContentAccessWithWrite(db as never, undefined, { revisions: true } as never));
	const relations = createEmDashRelations(async () => db as never);
	const provider = createFakePaymentProvider();
	const ctx = createFakePluginContext(buildSchemaDefinitions(options).collections);
	Object.assign(ctx, { content });
	const container = createContainer(ctx, options, {}, {
		createSchemaPort: async () => createReadySchemaPort(buildSchemaDefinitions(options).collections),
		createProvider: () => provider,
		relations,
		env: { STRIPE_SECRET_KEY: "sk_test_x" },
	});
	const make = async (collection: string, data: Record<string, unknown>, references: Record<string, string[]> = {}) =>
		(await relations.createWithReferences(collection, { data, status: "published" }, references)).id;
	const product = await make(slugs.products, { [PRODUCT_FIELD.title]: "Tee", [PRODUCT_FIELD.sku]: "TEE", [PRODUCT_FIELD.hasVariants]: true, [PRODUCT_FIELD.price]: 5000 });
	const variant = await make(slugs.variants, { [VARIANT_FIELD.title]: "Tee S", [VARIANT_FIELD.sku]: "TEE-S", [VARIANT_FIELD.isActive]: true }, { [VARIANT_FIELD.product]: [product] });
	const service = createCatalogSyncService(container, createEventPublisher(container));
	await syncManagedPrices(container, { entity: "product", id: product });
	await service.syncEntity({ entity: "product", id: product });
	const [priceLink] = (await relations.children(slugs.variants, variant, VARIANT_FIELD.prices, { includeDrafts: true })).items;
	return { db, content, relations, provider, container, service, product, variant, priceId: priceLink!.id };
};

const stripePrice = (provider: ReturnType<typeof createFakePaymentProvider>, priceId: string) => [...provider.prices.values()].find((price) => price.entityKey === priceEntityKey(priceId));

describe("trashing and deactivating a variant on a real EmDash database", () => {
	it("syncs, then a trash through EmDash's own delete archives the Stripe product and price and leaves no link due", async () => {
		const t = await setup();
		expect(stripePrice(t.provider, t.priceId)?.isActive).toBe(true);
		expect(await t.container.catalogLinks.listDue(FAR_FUTURE, 100)).toEqual([]);

		// What the host does on a trash: beforeDelete hooks, the soft delete, afterDelete hooks.
		await t.service.prepareDelete({ entity: "variant", id: t.variant });
		expect((await handleContentDelete(t.db as never, slugs.variants, t.variant)).success).toBe(true);
		// The trap: nothing hanging off the trashed variant is readable any more.
		expect(await t.container.catalog.getVariant(t.variant)).toBeNull();
		expect(await t.container.catalog.getPrice(t.priceId)).toBeNull();
		await expect(t.relations.children(slugs.variants, t.variant, VARIANT_FIELD.prices, { includeDrafts: true })).rejects.toThrow();

		await t.service.archiveDeleted({ entity: "variant", id: t.variant });
		await t.service.processDue(50);
		expect(stripePrice(t.provider, t.priceId)?.isActive).toBe(false);
		expect([...t.provider.products.values()].find((product) => product.entityKey === variantEntityKey(t.variant))?.isActive).toBe(false);
		expect((await t.content.get(slugs.prices, t.priceId))!.data[PRICE_FIELD.isActive]).toBeFalsy();
		expect(await t.container.catalogLinks.listDue(FAR_FUTURE, 100)).toEqual([]);
	});

	it("archives and restores the managed price entry as the variant is deactivated and reactivated", async () => {
		const t = await setup();
		const setActive = async (isActive: boolean) => {
			await t.content.update(slugs.variants, t.variant, { [VARIANT_FIELD.isActive]: isActive });
			await syncManagedPrices(t.container, { entity: "variant", id: t.variant });
			await t.service.syncEntity({ entity: "variant", id: t.variant });
		};
		await setActive(false);
		expect((await t.content.get(slugs.prices, t.priceId))!.data[PRICE_FIELD.isActive]).toBeFalsy();
		expect(stripePrice(t.provider, t.priceId)?.isActive).toBe(false);
		await setActive(true);
		expect((await t.content.get(slugs.prices, t.priceId))!.data[PRICE_FIELD.isActive]).toBeTruthy();
		expect(stripePrice(t.provider, t.priceId)?.isActive).toBe(true);
	});
});
