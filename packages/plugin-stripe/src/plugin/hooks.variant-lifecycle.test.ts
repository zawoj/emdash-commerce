import type { PluginDefinition } from "emdash";
import { beforeEach, describe, expect, it } from "vitest";

import { PRICE_FIELD, VARIANT_FIELD } from "../adapters/emdash/schema/field-names.js";
import { variantEntityKey, priceEntityKey } from "../services/catalog/entity-keys.js";
import { createModelWorld, type ModelWorld } from "../services/catalog/model-test-support.js";
import { createCatalogSyncService } from "../services/catalog-sync.js";
import { createEventPublisher } from "../services/outbox.js";
import { createStripeCommercePlugin } from "./index.js";

type Hooks = NonNullable<PluginDefinition["hooks"]>;
type Handler = (event: unknown, ctx: unknown) => Promise<unknown>;

const hookOf = (hooks: Hooks, name: keyof Hooks): Handler => {
	const hook = hooks[name] as unknown as Handler | { handler: Handler };
	return typeof hook === "function" ? hook : hook.handler;
};

const FAR_FUTURE = "2999-01-01T00:00:00.000Z";

interface Shop {
	w: ModelWorld;
	run: (name: keyof Hooks, event: unknown) => Promise<unknown>;
	productId: string;
	small: string;
	medium: string;
}

const priceEntriesOf = async (s: Shop, variantId: string) => {
	const links = await s.w.container.relations.children(s.w.slugs.variants, variantId, VARIANT_FIELD.prices, { includeDrafts: true });
	const ids = new Set(links.items.map((link) => link.id));
	return s.w.ctx.content.entries(s.w.slugs.prices).filter((entry) => ids.has(entry.id));
};

const managedOf = async (s: Shop, variantId: string) => (await priceEntriesOf(s, variantId))[0]!;
const stripePriceOf = (s: Shop, priceId: string) => [...s.w.provider.prices.values()].find((price) => price.entityKey === priceEntityKey(priceId));
const stripeVariantProductOf = (s: Shop, variantId: string) => [...s.w.provider.products.values()].find((product) => product.entityKey === variantEntityKey(variantId));

const saveVariant = (s: Shop, variantId: string, data: Record<string, unknown>) =>
	s.w.ctx.content.update(s.w.slugs.variants, variantId, data).then(() => s.run("content:afterSave", { collection: s.w.slugs.variants, isNew: false, content: { id: variantId, data } }));

/** A published product with two variants, each with a managed price, all synced to Stripe through the hooks. */
const shop = async (): Promise<Shop> => {
	const w = createModelWorld();
	const hooks = createStripeCommercePlugin({ supportedCurrencies: ["pln"] }, {}, w.deps).hooks as Hooks;
	const run = (name: keyof Hooks, event: unknown) => hookOf(hooks, name)(event, w.ctx);
	const size = await w.attribute({ name: "Size", values: [{ label: "S", code: "S" }, { label: "M", code: "M" }] });
	const typeId = await w.productType({ name: "Shirt", axes: [size.id] });
	const productId = await w.product({ title: "Tee", sku: "TEE", typeId, hasVariants: true, price: 5000 });
	const small = await w.variant({ productId, title: "Tee S", valueIds: [size.valueIds[0]!], sku: "TEE-S" });
	const medium = await w.variant({ productId, title: "Tee M", valueIds: [size.valueIds[1]!], sku: "TEE-M" });
	await run("content:afterPublish", { collection: w.slugs.products, content: { id: productId, status: "published", data: {} } });
	return { w, run, productId, small, medium };
};

const dueLinks = async (s: Shop) => (await s.w.container.catalogLinks.listDue(FAR_FUTURE, 100)).map((link) => link.entityKey);

describe("a variant's life cycle reaches Stripe and the price entries", () => {
	let s: Shop;
	beforeEach(async () => {
		s = await shop();
	});

	it("starts with an active managed price and a Stripe price per variant", async () => {
		const entry = await managedOf(s, s.small);
		expect(entry.data).toMatchObject({ [PRICE_FIELD.isActive]: 1, [PRICE_FIELD.isManaged]: 1, [PRICE_FIELD.unitAmount]: 5000 });
		expect(stripePriceOf(s, entry.id)?.isActive).toBe(true);
		expect(await dueLinks(s)).toEqual([]);
	});

	it("archives the managed price when the variant is set inactive, and restores it when it is active again", async () => {
		const entry = await managedOf(s, s.small);
		await saveVariant(s, s.small, { [VARIANT_FIELD.isActive]: false });
		expect((await managedOf(s, s.small)).data[PRICE_FIELD.isActive]).toBeFalsy();
		expect(stripePriceOf(s, entry.id)?.isActive).toBe(false);
		expect(stripeVariantProductOf(s, s.small)?.isActive).toBe(false);
		// The sibling is untouched.
		expect((await managedOf(s, s.medium)).data[PRICE_FIELD.isActive]).toBeTruthy();

		await saveVariant(s, s.small, { [VARIANT_FIELD.isActive]: true });
		expect(await managedOf(s, s.small)).toMatchObject({ id: entry.id, data: { [PRICE_FIELD.isActive]: 1, [PRICE_FIELD.unitAmount]: 5000 } });
		expect(stripePriceOf(s, entry.id)?.isActive).toBe(true);
		expect(stripeVariantProductOf(s, s.small)?.isActive).toBe(true);
	});

	it("archives the Stripe product and price of a trashed variant, settles its links and deactivates its price entry", async () => {
		const entry = await managedOf(s, s.small);
		await s.run("content:beforeDelete", { collection: s.w.slugs.variants, id: s.small, permanent: false });
		await s.w.ctx.content.delete!(s.w.slugs.variants, s.small);
		await s.run("content:afterDelete", { collection: s.w.slugs.variants, id: s.small, permanent: false });
		expect(stripeVariantProductOf(s, s.small)?.isActive).toBe(false);
		expect(stripePriceOf(s, entry.id)?.isActive).toBe(false);
		expect(s.w.ctx.content.entries(s.w.slugs.prices).find((candidate) => candidate.id === entry.id)!.data[PRICE_FIELD.isActive]).toBeFalsy();
		expect(await dueLinks(s)).toEqual([]);
		expect(stripeVariantProductOf(s, s.medium)?.isActive).toBe(true);
	});

	it("cron settles a trashed variant and its orphaned price even when the delete hook never ran", async () => {
		const entry = await managedOf(s, s.small);
		const service = createCatalogSyncService(s.w.container, createEventPublisher(s.w.container));
		// beforeDelete ran (the links are pending), the delete happened, afterDelete never did: cron alone settles them.
		await service.prepareDelete({ entity: "variant", id: s.small });
		await s.w.ctx.content.delete!(s.w.slugs.variants, s.small);
		expect((await dueLinks(s)).sort()).toEqual([priceEntityKey(entry.id), variantEntityKey(s.small)].sort());
		await service.processDue(50);
		expect(stripePriceOf(s, entry.id)?.isActive).toBe(false);
		expect(await dueLinks(s)).toEqual([]);
	});
});

describe("links that never reached Stripe", () => {
	it("a variant deleted before its first sync leaves no pending link behind, and cron finds nothing to retry", async () => {
		const w = createModelWorld();
		const productId = await w.product({ title: "Tee", sku: "TEE", hasVariants: true, price: 5000 });
		const variantId = await w.variant({ productId, title: "Tee S", isActive: false });
		const hooks = createStripeCommercePlugin({ supportedCurrencies: ["pln"] }, {}, w.deps).hooks as Hooks;
		const afterSave = hookOf(hooks, "content:afterSave");
		const afterDelete = hookOf(hooks, "content:afterDelete");
		await afterSave({ collection: w.slugs.variants, isNew: true, content: { id: variantId, data: {} } }, w.ctx);
		expect((await w.container.catalogLinks.get(variantEntityKey(variantId)))!.value).toMatchObject({ syncStatus: "pending", providerId: null });
		await w.ctx.content.delete!(w.slugs.variants, variantId);
		await afterDelete({ collection: w.slugs.variants, id: variantId, permanent: false }, w.ctx);
		expect((await w.container.catalogLinks.get(variantEntityKey(variantId)))!.value.syncStatus).toBe("synced");
		const service = createCatalogSyncService(w.container, createEventPublisher(w.container));
		expect(await w.container.catalogLinks.listDue(FAR_FUTURE, 100)).toEqual([]);
		expect(await service.processDue(10)).toBe(0);
	});
});
