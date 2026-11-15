import { beforeEach, describe, expect, it } from "vitest";

import { createBaselineLoader } from "../../adapters/emdash/content/baselines.js";
import { buildCollectionDefinitions } from "../../adapters/emdash/schema/collections.js";
import { PRICE_FIELD, PRODUCT_FIELD, VARIANT_FIELD } from "../../adapters/emdash/schema/field-names.js";
import { createProtectedFieldGuard, SaveRejectedError } from "../../adapters/emdash/schema/guard.js";
import { buildCollectionPolicies } from "../../adapters/emdash/schema/protected-fields.js";
import { commerceOptionsSchema } from "../../contracts/options.js";
import { PRICE_TYPE, TAX_BEHAVIOR, type Price } from "../../core/catalog.js";
import { toCurrencyCode } from "../../core/money.js";
import { selectDefaultPrice } from "../../core/price-selection.js";
import { buildHooks } from "../../plugin/hooks.js";
import { createModelWorld, type ModelWorld } from "./model-test-support.js";
import { MANAGED_CHANGE, syncManagedPrices } from "./managed-prices.js";

const options = commerceOptionsSchema.parse({ supportedCurrencies: ["pln"] });

/** The managed entries linked to a sellable, as stored. */
const managedOf = async (w: ModelWorld, kind: "product" | "variant", id: string) => {
	const owner = kind === "product" ? w.slugs.products : w.slugs.variants;
	const field = kind === "product" ? PRODUCT_FIELD.prices : VARIANT_FIELD.prices;
	const links = await w.container.relations.children(owner, id, field, { includeDrafts: true });
	const ids = new Set(links.items.map((link) => link.id));
	return w.ctx.content.entries(w.slugs.prices).filter((entry) => ids.has(entry.id) && entry.data[PRICE_FIELD.isManaged]);
};

const setProduct = (w: ModelWorld, id: string, data: Record<string, unknown>) => w.ctx.content.update(w.slugs.products, id, data);
const setVariant = (w: ModelWorld, id: string, data: Record<string, unknown>) => w.ctx.content.update(w.slugs.variants, id, data);

describe("managed prices", () => {
	let w: ModelWorld;
	beforeEach(() => {
		w = createModelWorld();
	});

	it("gives a simple product one managed entry: store currency, one-time, active, default, linked to the product", async () => {
		const productId = await w.product({ title: "Mug", price: 1200 });
		const changes = await syncManagedPrices(w.container, { entity: "product", id: productId });
		expect(changes).toEqual([{ priceId: expect.any(String), kind: MANAGED_CHANGE.created }]);
		const [entry, ...rest] = await managedOf(w, "product", productId);
		expect(rest).toEqual([]);
		expect(entry!.data).toMatchObject({
			[PRICE_FIELD.unitAmount]: 1200,
			[PRICE_FIELD.currency]: "pln",
			[PRICE_FIELD.type]: PRICE_TYPE.oneTime,
			[PRICE_FIELD.isActive]: 1,
			[PRICE_FIELD.isDefault]: 1,
			[PRICE_FIELD.isManaged]: 1,
			[PRICE_FIELD.taxBehavior]: TAX_BEHAVIOR.unspecified,
		});
		expect(entry!.status).toBe("published");
		expect(await w.container.catalog.getPrice(entry!.id)).toMatchObject({ productId, variantId: null, unitAmount: 1200, isManaged: true, isActive: true });
	});

	it("is idempotent: a replay or a second save creates no second entry and reports no change", async () => {
		const productId = await w.product({ price: 1200 });
		await syncManagedPrices(w.container, { entity: "product", id: productId });
		expect(await syncManagedPrices(w.container, { entity: "product", id: productId })).toEqual([]);
		expect(await managedOf(w, "product", productId)).toHaveLength(1);
	});

	it("serialises racing saves of one product: still exactly one entry", async () => {
		const productId = await w.product({ price: 1200 });
		await Promise.all([1, 2, 3].map(() => syncManagedPrices(w.container, { entity: "product", id: productId })));
		expect(await managedOf(w, "product", productId)).toHaveLength(1);
	});

	it("updates the amount in place (same entry) when the product price changes", async () => {
		const productId = await w.product({ price: 1200 });
		await syncManagedPrices(w.container, { entity: "product", id: productId });
		const [before] = await managedOf(w, "product", productId);
		await setProduct(w, productId, { [PRODUCT_FIELD.price]: 1500 });
		expect(await syncManagedPrices(w.container, { entity: "product", id: productId })).toEqual([{ priceId: before!.id, kind: MANAGED_CHANGE.updated }]);
		const entries = await managedOf(w, "product", productId);
		expect(entries).toHaveLength(1);
		expect(entries[0]!.data[PRICE_FIELD.unitAmount]).toBe(1500);
	});

	it("archives the managed entry when the price is cleared, and reactivates the same entry when it is set again", async () => {
		const productId = await w.product({ price: 1200 });
		await syncManagedPrices(w.container, { entity: "product", id: productId });
		const [entry] = await managedOf(w, "product", productId);
		await setProduct(w, productId, { [PRODUCT_FIELD.price]: null });
		expect(await syncManagedPrices(w.container, { entity: "product", id: productId })).toEqual([{ priceId: entry!.id, kind: MANAGED_CHANGE.archived }]);
		expect((await managedOf(w, "product", productId))[0]!.data[PRICE_FIELD.isActive]).toBe(0);
		await setProduct(w, productId, { [PRODUCT_FIELD.price]: 900 });
		await syncManagedPrices(w.container, { entity: "product", id: productId });
		const entries = await managedOf(w, "product", productId);
		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatchObject({ id: entry!.id });
		expect(entries[0]!.data).toMatchObject({ [PRICE_FIELD.isActive]: 1, [PRICE_FIELD.unitAmount]: 900 });
	});

	describe("a product with variants", () => {
		let productId: string;
		let inheriting: string;
		let overriding: string;
		beforeEach(async () => {
			productId = await w.product({ title: "Tee", hasVariants: true, price: 5000 });
			inheriting = await w.variant({ productId, title: "S" });
			overriding = await w.variant({ productId, title: "M", price: 6000 });
			await syncManagedPrices(w.container, { entity: "product", id: productId });
		});

		const amountOf = async (variantId: string) => {
			const [entry] = await managedOf(w, "variant", variantId);
			return entry ? { amount: entry.data[PRICE_FIELD.unitAmount], isActive: Boolean(entry.data[PRICE_FIELD.isActive]) } : null;
		};

		it("mirrors the override on a variant that has one and the product price on one that has none; the product itself carries none", async () => {
			expect(await amountOf(inheriting)).toEqual({ amount: 5000, isActive: true });
			expect(await amountOf(overriding)).toEqual({ amount: 6000, isActive: true });
			expect(await managedOf(w, "product", productId)).toEqual([]);
		});

		it("propagates a product price change to every variant without an override, and leaves overrides alone", async () => {
			await setProduct(w, productId, { [PRODUCT_FIELD.price]: 5500 });
			await syncManagedPrices(w.container, { entity: "product", id: productId });
			expect(await amountOf(inheriting)).toMatchObject({ amount: 5500 });
			expect(await amountOf(overriding)).toMatchObject({ amount: 6000 });
		});

		it("clearing the product price archives the inheriting variants' entries only", async () => {
			await setProduct(w, productId, { [PRODUCT_FIELD.price]: null });
			await syncManagedPrices(w.container, { entity: "product", id: productId });
			expect(await amountOf(inheriting)).toMatchObject({ isActive: false });
			expect(await amountOf(overriding)).toEqual({ amount: 6000, isActive: true });
		});

		it("a variant save touches only that variant: removing the override makes it follow the product again", async () => {
			await setProduct(w, productId, { [PRODUCT_FIELD.price]: 5100 });
			await setVariant(w, overriding, { [VARIANT_FIELD.price]: null });
			const changes = await syncManagedPrices(w.container, { entity: "variant", id: overriding });
			expect(changes).toHaveLength(1);
			expect(await amountOf(overriding)).toMatchObject({ amount: 5100 });
			// The product's own change was not applied to the other variant by this variant-scoped sync.
			expect(await amountOf(inheriting)).toMatchObject({ amount: 5000 });
		});

		it("archives every stray duplicate and keeps exactly one active entry", async () => {
			const stray = w.ctx.content.seedEntry(w.slugs.prices, { [PRICE_FIELD.type]: "one_time", [PRICE_FIELD.unitAmount]: 5000, [PRICE_FIELD.currency]: "pln", [PRICE_FIELD.isActive]: true, [PRICE_FIELD.isManaged]: true }, { status: "published" });
			await w.ctx.fakeRelations.setParent(w.slugs.prices, stray, PRICE_FIELD.variant, inheriting);
			await syncManagedPrices(w.container, { entity: "variant", id: inheriting });
			const entries = await managedOf(w, "variant", inheriting);
			expect(entries).toHaveLength(2);
			expect(entries.filter((entry) => entry.data[PRICE_FIELD.isActive])).toHaveLength(1);
		});
	});

	it("leaves hand-made prices alone", async () => {
		const productId = await w.product({ price: 1000 });
		const manual = await w.price({ productId, amount: 777 });
		await syncManagedPrices(w.container, { entity: "product", id: productId });
		expect(w.ctx.content.entries(w.slugs.prices).find((entry) => entry.id === manual)!.data).toMatchObject({ [PRICE_FIELD.unitAmount]: 777 });
		expect(await managedOf(w, "product", productId)).toHaveLength(1);
	});

	describe("through the content hooks and Stripe sync", () => {
		const run = async (name: "content:afterSave" | "content:afterPublish", collection: string, id: string) => {
			const hooks = buildHooks(options, {}, w.deps);
			const hook = hooks[name]!;
			const handler = typeof hook === "function" ? hook : hook.handler;
			await handler({ collection, isNew: false, content: { id, data: {} } } as never, w.ctx as never);
		};

		it("creates the Stripe price on save, and an amount change creates a new one and archives the old", async () => {
			const productId = await w.product({ price: 1200 });
			await run("content:afterSave", w.slugs.products, productId);
			expect(w.provider.callsOf("createPrice")).toHaveLength(1);
			await setProduct(w, productId, { [PRODUCT_FIELD.price]: 1800 });
			await run("content:afterSave", w.slugs.products, productId);
			expect(w.provider.callsOf("createPrice")).toHaveLength(2);
			expect(w.provider.callsOf("updatePrice").some((call) => JSON.stringify(call).includes("\"isActive\":false"))).toBe(true);
			expect(await managedOf(w, "product", productId)).toHaveLength(1);
			// Replaying the hook changes nothing at Stripe.
			await run("content:afterSave", w.slugs.products, productId);
			expect(w.provider.callsOf("createPrice")).toHaveLength(2);
		});

		it("publishing settles the managed price too (a draft price becomes live on publish)", async () => {
			const productId = await w.product({ price: 700 });
			await run("content:afterPublish", w.slugs.products, productId);
			expect(await managedOf(w, "product", productId)).toHaveLength(1);
		});

		it("a variant save creates its managed price after the variant's derived fields", async () => {
			const productId = await w.product({ hasVariants: true, price: 900 });
			const variantId = await w.variant({ productId });
			await run("content:afterSave", w.slugs.variants, variantId);
			expect((await managedOf(w, "variant", variantId))[0]!.data[PRICE_FIELD.unitAmount]).toBe(900);
		});
	});
});

describe("editors and managed prices", () => {
	const definitions = buildCollectionDefinitions(options.collections, options.supportedCurrencies);
	const policies = buildCollectionPolicies(definitions, options.collections);
	let w: ModelWorld;
	let managedId: string;
	let manualId: string;
	beforeEach(async () => {
		w = createModelWorld();
		const productId = await w.product({ price: 1200 });
		await syncManagedPrices(w.container, { entity: "product", id: productId });
		managedId = (await managedOf(w, "product", productId))[0]!.id;
		manualId = await w.price({ productId, amount: 300 });
	});

	const save = (id: string, content: Record<string, unknown>) =>
		createProtectedFieldGuard(policies, createBaselineLoader(w.ctx.content))({ collection: w.slugs.prices, isNew: false, id, actor: { id: "editor" }, content });

	it("refuses an editor's change to a managed price's amount, currency, type or active flag, with a clear message", async () => {
		for (const change of [{ [PRICE_FIELD.unitAmount]: 1 }, { [PRICE_FIELD.currency]: "pln", [PRICE_FIELD.type]: "recurring" }, { [PRICE_FIELD.isActive]: false }]) {
			const error = await save(managedId, change).catch((caught: unknown) => caught);
			expect(error).toBeInstanceOf(SaveRejectedError);
			expect((error as Error).message).toContain("managed by the commerce plugin");
		}
	});

	it("accepts an unchanged form re-submit and edits to fields that are not money (nickname)", async () => {
		await expect(save(managedId, { [PRICE_FIELD.unitAmount]: 1200, [PRICE_FIELD.currency]: "pln", [PRICE_FIELD.nickname]: "Renamed" })).resolves.toBeUndefined();
	});

	it("refuses turning a price into a managed one (the flag is protected) and leaves hand-made prices editable", async () => {
		await expect(save(manualId, { [PRICE_FIELD.isManaged]: true })).rejects.toBeInstanceOf(SaveRejectedError);
		await expect(save(manualId, { [PRICE_FIELD.unitAmount]: 450 })).resolves.toBeUndefined();
	});
});

describe("default price selection", () => {
	const price = (over: Partial<Price> & { id: string }): Price => ({
		productId: "p",
		variantId: null,
		nickname: null,
		type: PRICE_TYPE.oneTime,
		unitAmount: 1000,
		currency: toCurrencyCode("pln"),
		recurring: null,
		taxBehavior: TAX_BEHAVIOR.unspecified,
		lookupKey: null,
		isActive: true,
		isDefault: false,
		isManaged: false,
		...over,
	});

	it("prefers an explicit default extra price over the managed price", () => {
		expect(selectDefaultPrice([price({ id: "m", isManaged: true, isDefault: true }), price({ id: "x", isDefault: true, unitAmount: 99 })])?.id).toBe("x");
	});
	it("otherwise takes the managed price, even when a cheaper hand-made one exists", () => {
		expect(selectDefaultPrice([price({ id: "m", isManaged: true, unitAmount: 500 }), price({ id: "c", unitAmount: 100 })])?.id).toBe("m");
	});
	it("falls back to the cheapest one-time, then the cheapest of any kind; inactive prices never win", () => {
		expect(selectDefaultPrice([price({ id: "a", unitAmount: 300 }), price({ id: "b", unitAmount: 200 }), price({ id: "r", type: PRICE_TYPE.recurring, unitAmount: 50 })])?.id).toBe("b");
		expect(selectDefaultPrice([price({ id: "r", type: PRICE_TYPE.recurring, unitAmount: 50 })])?.id).toBe("r");
		expect(selectDefaultPrice([price({ id: "off", isActive: false, isManaged: true })])).toBeNull();
		expect(selectDefaultPrice([])).toBeNull();
	});
});
