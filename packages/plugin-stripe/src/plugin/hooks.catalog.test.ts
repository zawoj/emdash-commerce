import type { PluginDefinition } from "emdash";
import { describe, expect, it } from "vitest";

import { PRICE_FIELD, PRODUCT_FIELD, VARIANT_FIELD } from "../adapters/emdash/schema/field-names.js";
import { createModelWorld } from "../services/catalog/model-test-support.js";
import { generateVariants } from "../services/catalog/variant-generator.js";
import { createStripeCommercePlugin } from "./index.js";

type Hooks = NonNullable<PluginDefinition["hooks"]>;
type Handler = (event: any, ctx: any) => Promise<any>;

const handlerOf = (hooks: Hooks, name: keyof Hooks): Handler => {
	const hook = hooks[name] as unknown as Handler | { handler: Handler };
	return typeof hook === "function" ? hook : hook.handler;
};

const setup = async () => {
	const w = createModelWorld();
	const plugin = createStripeCommercePlugin({ supportedCurrencies: ["pln"] }, {}, w.deps);
	const hooks = plugin.hooks as Hooks;
	const size = await w.attribute({ name: "Size", values: [{ label: "S", code: "S" }, { label: "M", code: "M" }] });
	const material = await w.attribute({ name: "Material", inputType: "text" });
	const typeId = await w.productType({ name: "Shirt", axes: [size.id], specs: [material.id], required: [material.id] });
	return { w, plugin, hooks, size, material, typeId, run: (name: keyof Hooks, event: unknown) => handlerOf(hooks, name)(event, w.ctx) };
};

/** What EmDash accepts as a cancel decision (plugins/content-policy.ts inspectContentPolicyDecision). */
const isAcceptedCancel = (decision: unknown): boolean => {
	if (typeof decision !== "object" || decision === null) return false;
	const record = decision as Record<string, unknown>;
	if (Object.keys(record).length !== 2 || record.cancel !== true || typeof record.reason !== "string") return false;
	// eslint-disable-next-line no-control-regex
	return record.reason.trim().length > 0 && [...record.reason].length <= 500 && !/[\u0000-\u001f\u007f]/.test(record.reason);
};

describe("publish policy (content:beforePublish and content:beforeSchedule)", () => {
	it("registers under the host's content-policy capability", () => {
		expect(createStripeCommercePlugin({}).capabilities).toContain("hooks.content-policy:register");
	});

	it.each(["content:beforePublish", "content:beforeSchedule"] as const)("%s cancels a product that is missing its SKU and its required specification, with a message the host accepts", async (name) => {
		const t = await setup();
		const product = await t.w.product({ title: "Mug", typeId: t.typeId });
		const decision = await t.run(name, { collection: t.w.slugs.products, content: { id: product, data: { title: "Mug" } }, origin: { source: "api" } });
		expect(isAcceptedCancel(decision)).toBe(true);
		expect(decision.reason).toContain('Cannot publish "Mug"');
		expect(decision.reason).toContain("Material");
		expect(decision.reason).toContain("Add a SKU");
	});

	it("lets a complete product through, and ignores every other collection", async () => {
		const t = await setup();
		const product = await t.w.product({ title: "Mug", sku: "MUG", typeId: t.typeId });
		const data = { title: "Mug", [PRODUCT_FIELD.sku]: "MUG", [PRODUCT_FIELD.specs]: { [t.material.id]: "cotton" } };
		expect(await t.run("content:beforePublish", { collection: t.w.slugs.products, content: { id: product, data }, origin: { source: "api" } })).toBeUndefined();
		expect(await t.run("content:beforePublish", { collection: "posts", content: { id: "x", data: {} }, origin: { source: "api" } })).toBeUndefined();
		expect(await t.run("content:beforePublish", { collection: t.w.slugs.brands, content: { id: "x", data: {} }, origin: { source: "api" } })).toBeUndefined();
	});

	it("cancels a variant product without an active variant, and passes it once a variant exists", async () => {
		const t = await setup();
		const product = await t.w.product({ title: "Tee", typeId: t.typeId, hasVariants: true });
		const data = { title: "Tee", [PRODUCT_FIELD.hasVariants]: true, [PRODUCT_FIELD.specs]: { [t.material.id]: "x" } };
		const event = { collection: t.w.slugs.products, content: { id: product, data }, origin: { source: "api" } };
		expect((await t.run("content:beforePublish", event)).reason).toContain("at least one active variant");
		await generateVariants(t.w.container, product, { [t.size.id]: [t.size.valueIds[0]!] });
		expect(await t.run("content:beforePublish", event)).toBeUndefined();
	});
});

describe("content:beforeSave catalog rules", () => {
	it("rejects a bad swatch with the editor-facing error name, whoever saves", async () => {
		const t = await setup();
		const event = (swatch: string) => ({ collection: t.w.slugs.attributeValues, isNew: true, actor: { id: "u1" }, content: { label: "Black", swatch } });
		await expect(t.run("content:beforeSave", event("black"))).rejects.toMatchObject({ name: "ContentSaveRejectedError", message: expect.stringContaining("#rgb or #rrggbb") });
		await expect(t.run("content:beforeSave", event("#000"))).resolves.toBeUndefined();
	});

	it("rejects a negative price on a product and a variant", async () => {
		const t = await setup();
		await expect(t.run("content:beforeSave", { collection: t.w.slugs.products, isNew: true, actor: { id: "u1" }, content: { title: "x", price: -5 } })).rejects.toMatchObject({ name: "ContentSaveRejectedError" });
		await expect(t.run("content:beforeSave", { collection: t.w.slugs.variants, isNew: false, id: "v", actor: { id: "u1" }, content: { price: 1.5 } })).rejects.toMatchObject({ name: "ContentSaveRejectedError" });
	});

	it("keeps the derived and plugin-written fields away from editors: options_key, specs and is_managed", async () => {
		const t = await setup();
		const forge = (collection: string, content: Record<string, unknown>) => t.run("content:beforeSave", { collection, isNew: true, actor: { id: "u1" }, content });
		await expect(forge(t.w.slugs.variants, { title: "x", [VARIANT_FIELD.optionsKey]: "a|b" })).rejects.toMatchObject({ name: "ContentSaveRejectedError" });
		await expect(forge(t.w.slugs.products, { title: "x", [PRODUCT_FIELD.specs]: { a: "b" } })).rejects.toMatchObject({ name: "ContentSaveRejectedError" });
		await expect(forge(t.w.slugs.prices, { [PRICE_FIELD.isManaged]: true })).rejects.toMatchObject({ name: "ContentSaveRejectedError" });
		// The plugin's own writes carry no actor and pass.
		await expect(t.run("content:beforeSave", { collection: t.w.slugs.variants, isNew: true, content: { [VARIANT_FIELD.optionsKey]: "a|b" } })).resolves.toBeUndefined();
	});
});

describe("content:afterSave catalog follow-ups", () => {
	it("derives a hand-made variant's key, title and SKU from its links before it is synced", async () => {
		const t = await setup();
		const product = await t.w.product({ title: "Tee", sku: "TEE", typeId: t.typeId, hasVariants: true, specs: { [t.material.id]: "x" } });
		await t.w.ctx.content.update(t.w.slugs.products, product, {});
		const variantId = t.w.ctx.content.seedEntry(t.w.slugs.variants, { [VARIANT_FIELD.isActive]: true }, { status: "published" });
		await t.w.ctx.fakeRelations.setParent(t.w.slugs.variants, variantId, VARIANT_FIELD.product, product);
		await t.w.ctx.fakeRelations.setChildren(t.w.slugs.variants, variantId, VARIANT_FIELD.optionValues, [t.size.valueIds[1]!]);
		await t.run("content:afterSave", { collection: t.w.slugs.variants, isNew: true, content: { id: variantId, data: {} } });
		expect(t.w.ctx.content.entries(t.w.slugs.variants).find((entry) => entry.id === variantId)!.data).toMatchObject({
			[VARIANT_FIELD.optionsKey]: t.size.valueIds[1],
			[VARIANT_FIELD.title]: "Tee — M",
			[VARIANT_FIELD.sku]: "TEE-M",
		});
	});

	it("does not send a price linked to neither parent (or to both) to Stripe, and marks it failed instead", async () => {
		const t = await setup();
		const product = await t.w.product({ title: "Tee", sku: "TEE" });
		await t.w.ctx.content.update(t.w.slugs.products, product, {});
		const neither = await t.w.price({});
		await t.run("content:afterSave", { collection: t.w.slugs.prices, isNew: true, content: { id: neither, data: {} } });
		expect(t.w.provider.callsOf("createPrice")).toEqual([]);
		expect(t.w.ctx.content.entries(t.w.slugs.prices).find((entry) => entry.id === neither)!.data).toMatchObject({ [PRICE_FIELD.stripeSyncStatus]: "failed" });
	});

	it("does not sync a price linked to both a product and a variant either", async () => {
		const t = await setup();
		const product = await t.w.product({ title: "Tee", sku: "TEE" });
		await t.w.ctx.content.update(t.w.slugs.products, product, {});
		const variant = await t.w.variant({ productId: product, title: "V" });
		const both = await t.w.price({ productId: product, variantId: variant, amount: 2500 });
		await t.run("content:afterSave", { collection: t.w.slugs.prices, isNew: true, content: { id: both, data: {} } });
		expect(t.w.provider.callsOf("createPrice")).toEqual([]);
		expect(t.w.ctx.content.entries(t.w.slugs.prices).find((entry) => entry.id === both)!.data).toMatchObject({ [PRICE_FIELD.stripeSyncStatus]: "failed" });
	});

	it("still syncs a price that has exactly one parent", async () => {
		const t = await setup();
		const product = await t.w.product({ title: "Tee", sku: "TEE" });
		await t.w.ctx.content.update(t.w.slugs.products, product, {});
		const price = await t.w.price({ productId: product, amount: 2500 });
		await t.run("content:afterSave", { collection: t.w.slugs.prices, isNew: true, content: { id: price, data: {} } });
		expect(t.w.provider.callsOf("createPrice").length + t.w.provider.callsOf("createProduct").length).toBeGreaterThan(0);
	});
});
