import { beforeEach, describe, expect, it } from "vitest";

import { PRICE_FIELD, PRODUCT_FIELD, VARIANT_FIELD } from "../../adapters/emdash/schema/field-names.js";
import { isCommerceError } from "../../core/errors.js";
import { deriveVariantFields } from "./derive-variant.js";
import { checkPriceLinks, PRICE_LINK_PROBLEM } from "./price-links.js";
import { productPublishProblems, productPublishRefusal } from "./publish-guard.js";
import { catalogSaveProblems } from "./save-checks.js";
import { coerceSpecValue, loadSpecificationModel, saveSpecification } from "./specs.js";
import { generateVariants, loadVariantGeneratorModel } from "./variant-generator.js";
import { createModelWorld, type ModelWorld } from "./model-test-support.js";

const failure = async (promise: Promise<unknown>) => {
	try {
		await promise;
	} catch (error) {
		return error;
	}
	throw new Error("expected a failure");
};

/** A shirt type with a Size axis (S, M, L) and a Colour axis (Black, White), one required spec (Material). */
const shirtWorld = async () => {
	const w = createModelWorld();
	const size = await w.attribute({ name: "Size", values: [{ label: "S", code: "S" }, { label: "M", code: "M" }, { label: "L", code: "L" }] });
	const colour = await w.attribute({ name: "Colour", presentation: "swatch", values: [{ label: "Black", code: "BLK", swatch: "#000000" }, { label: "White", code: "WHT", swatch: "#ffffff" }] });
	const material = await w.attribute({ name: "Material", inputType: "text" });
	const typeId = await w.productType({ name: "Shirt", axes: [size.id, colour.id], specs: [material.id], required: [material.id] });
	return { w, size, colour, material, typeId };
};

describe("variant generator", () => {
	let t: Awaited<ReturnType<typeof shirtWorld>>;
	let productId: string;
	beforeEach(async () => {
		t = await shirtWorld();
		productId = await t.w.product({ title: "Tee", sku: "TEE-1", typeId: t.typeId, hasVariants: true });
	});

	const tick = (...pairs: Array<[string, string[]]>) => Object.fromEntries(pairs);

	it("creates the cartesian product of the ticked values, published, linked to the product and to one value per axis, with derived title, SKU and key", async () => {
		const result = await generateVariants(t.w.container, productId, tick([t.size.id, [t.size.valueIds[0]!, t.size.valueIds[1]!]], [t.colour.id, t.colour.valueIds]));
		expect(result).toMatchObject({ created: 4, skipped: 0 });
		const variants = await t.w.container.catalog.listVariants(productId);
		expect(variants.map((variant) => variant.title).sort()).toEqual(["Tee — M / Black", "Tee — M / White", "Tee — S / Black", "Tee — S / White"]);
		const small = variants.find((variant) => variant.title === "Tee — S / Black")!;
		expect(small).toMatchObject({ productId, sku: "TEE-1-S-BLK", isActive: true, optionValueIds: [t.size.valueIds[0], t.colour.valueIds[0]] });
		expect(small.optionsKey).toBe([t.size.valueIds[0], t.colour.valueIds[0]].sort().join("|"));
		expect(t.w.ctx.content.entries(t.w.slugs.variants).every((entry) => entry.status === "published")).toBe(true);
		// The plugin's own writes fire no hooks, so the new variants are queued for Stripe by the generator itself.
		expect(t.w.provider.callsOf("createProduct").length).toBeGreaterThan(0);
	});

	it("skips combinations that exist: a second identical run creates nothing", async () => {
		const selection = tick([t.size.id, [t.size.valueIds[0]!]], [t.colour.id, t.colour.valueIds]);
		await generateVariants(t.w.container, productId, selection);
		const again = await generateVariants(t.w.container, productId, selection);
		expect(again).toMatchObject({ created: 0, skipped: 2 });
		expect(await t.w.container.catalog.listVariants(productId)).toHaveLength(2);
		const more = await generateVariants(t.w.container, productId, tick([t.size.id, [t.size.valueIds[0]!, t.size.valueIds[1]!]], [t.colour.id, t.colour.valueIds]));
		expect(more).toMatchObject({ created: 2, skipped: 2 });
	});

	it("only generates the ticked values, in the axis' value order", async () => {
		await generateVariants(t.w.container, productId, tick([t.size.id, [t.size.valueIds[2]!]], [t.colour.id, [t.colour.valueIds[1]!]]));
		const [variant] = await t.w.container.catalog.listVariants(productId);
		expect(variant!.title).toBe("Tee — L / White");
	});

	it("refuses an axis with nothing ticked, and a value that is not offered for the axis, without creating anything", async () => {
		const empty = await failure(generateVariants(t.w.container, productId, tick([t.size.id, [t.size.valueIds[0]!]])));
		expect(isCommerceError(empty) && empty.message).toContain("Tick at least one value for Colour");
		const stranger = await failure(generateVariants(t.w.container, productId, tick([t.size.id, [t.colour.valueIds[0]!]], [t.colour.id, t.colour.valueIds])));
		expect(isCommerceError(stranger) && stranger.message).toContain("not an allowed");
		expect(await t.w.container.catalog.listVariants(productId)).toEqual([]);
	});

	it("honours the allowed values of the type: only they are offered and accepted", async () => {
		const size2 = await t.w.attribute({ name: "Size2", values: ["a", "b", "c"] });
		const restricted = await t.w.productType({ name: "Restricted", axes: [size2.id], allowed: [size2.valueIds[0]!, size2.valueIds[2]!] });
		const product = await t.w.product({ title: "R", sku: "R", typeId: restricted, hasVariants: true });
		const model = await loadVariantGeneratorModel(t.w.container, product);
		expect(model.axes[0]!.values.map((value) => value.label)).toEqual(["a", "c"]);
		const refused = await failure(generateVariants(t.w.container, product, { [size2.id]: [size2.valueIds[1]!] }));
		expect(isCommerceError(refused)).toBe(true);
	});

	it("caps a product at 50 variants in total: a run that would pass 50 refuses as a whole", async () => {
		const wide = await t.w.attribute({ name: "Wide", values: Array.from({ length: 30 }, (_, index) => `w${index}`) });
		const tall = await t.w.attribute({ name: "Tall", values: Array.from({ length: 2 }, (_, index) => `t${index}`) });
		const type = await t.w.productType({ name: "Grid", axes: [wide.id, tall.id] });
		const product = await t.w.product({ title: "Grid", sku: "G", typeId: type, hasVariants: true });
		const refused = await failure(generateVariants(t.w.container, product, { [wide.id]: wide.valueIds, [tall.id]: tall.valueIds }));
		expect(isCommerceError(refused) && refused.kind).toBe("catalogLimitExceeded");
		expect(await t.w.container.catalog.listVariants(product)).toEqual([]);
		// Exactly 50 fits: 25 x 2.
		const ok = await generateVariants(t.w.container, product, { [wide.id]: wide.valueIds.slice(0, 25), [tall.id]: tall.valueIds });
		expect(ok.created).toBe(50);
		// And an existing variant counts towards the cap.
		const over = await failure(generateVariants(t.w.container, product, { [wide.id]: wide.valueIds.slice(25, 26), [tall.id]: tall.valueIds.slice(0, 1) }));
		expect(isCommerceError(over) && over.kind).toBe("catalogLimitExceeded");
	});

	it("explains why it cannot run: no type, no axes, a non-select axis, an axis with no values", async () => {
		const noType = await t.w.product({ title: "Plain", hasVariants: true });
		expect((await loadVariantGeneratorModel(t.w.container, noType)).blockers[0]).toContain("Choose a product type");
		const bare = await t.w.productType({ name: "Bare" });
		const noAxes = await t.w.product({ title: "Bare", typeId: bare, hasVariants: true });
		expect((await loadVariantGeneratorModel(t.w.container, noAxes)).blockers[0]).toContain("no variant axes");
		const text = await t.w.attribute({ name: "Free", inputType: "text", values: ["x"] });
		const textType = await t.w.productType({ name: "Text", axes: [text.id] });
		const textProduct = await t.w.product({ title: "T", typeId: textType, hasVariants: true });
		expect((await loadVariantGeneratorModel(t.w.container, textProduct)).blockers.join(" ")).toContain("must be a select attribute");
		const none = await t.w.attribute({ name: "Empty", values: [] });
		const emptyType = await t.w.productType({ name: "EmptyT", axes: [none.id] });
		const emptyProduct = await t.w.product({ title: "E", typeId: emptyType, hasVariants: true });
		expect((await loadVariantGeneratorModel(t.w.container, emptyProduct)).blockers.join(" ")).toContain("has no values");
		const refused = await failure(generateVariants(t.w.container, noType, {}));
		expect(isCommerceError(refused)).toBe(true);
	});

	it("queues the new variants for sync best effort: a missing Stripe key never fails the generation", async () => {
		const world = createModelWorld();
		const container = { ...world.container, provider: async () => { throw new Error("no key"); } };
		const size = await world.attribute({ name: "Size", values: ["S"] });
		const type = await world.productType({ name: "T", axes: [size.id] });
		const product = await world.product({ title: "P", sku: "P", typeId: type, hasVariants: true });
		await expect(generateVariants(container, product, { [size.id]: size.valueIds })).resolves.toMatchObject({ created: 1 });
	});
});

describe("publish guard", () => {
	it("passes a complete simple product and a complete variant product", async () => {
		const { w, typeId, material, size, colour } = await shirtWorld();
		const simple = await w.product({ title: "Mug", sku: "MUG", typeId, specs: { [material.id]: "cotton" } });
		expect(await productPublishProblems(w.container, simple, { [PRODUCT_FIELD.sku]: "MUG", [PRODUCT_FIELD.specs]: { [material.id]: "cotton" } })).toEqual([]);
		const withVariants = await w.product({ title: "Tee", typeId, hasVariants: true });
		await w.variant({ productId: withVariants, valueIds: [size.valueIds[0]!, colour.valueIds[0]!] });
		expect(await productPublishProblems(w.container, withVariants, { [PRODUCT_FIELD.hasVariants]: true, [PRODUCT_FIELD.specs]: { [material.id]: "cotton" } })).toEqual([]);
		expect(await productPublishRefusal(w.container, { id: simple, data: { [PRODUCT_FIELD.sku]: "MUG", [PRODUCT_FIELD.specs]: { [material.id]: "cotton" } } })).toBeNull();
	});

	it("refuses a missing required specification, naming it", async () => {
		const { w, typeId, material } = await shirtWorld();
		const product = await w.product({ title: "Mug", sku: "MUG", typeId });
		expect(await productPublishProblems(w.container, product, { [PRODUCT_FIELD.sku]: "MUG" })).toEqual([`Fill the required specification: Material.`]);
		expect(await productPublishProblems(w.container, product, { [PRODUCT_FIELD.sku]: "MUG", [PRODUCT_FIELD.specs]: { [material.id]: "  " } })).toHaveLength(1);
	});

	it("refuses a product without variants that has no SKU", async () => {
		const { w } = await shirtWorld();
		const product = await w.product({ title: "Mug" });
		expect(await productPublishProblems(w.container, product, {})).toEqual(["Add a SKU: a product without variants needs one."]);
		expect(await productPublishProblems(w.container, product, { [PRODUCT_FIELD.sku]: "  " })).toHaveLength(1);
	});

	it("refuses a product with variants that has no active variant, and accepts one active among inactive", async () => {
		const { w, typeId, material, size, colour } = await shirtWorld();
		const product = await w.product({ title: "Tee", typeId, hasVariants: true });
		const data = { [PRODUCT_FIELD.hasVariants]: true, [PRODUCT_FIELD.specs]: { [material.id]: "x" } };
		expect(await productPublishProblems(w.container, product, data)).toEqual([expect.stringContaining("at least one active variant")]);
		await w.variant({ productId: product, valueIds: [size.valueIds[0]!, colour.valueIds[0]!], isActive: false });
		expect(await productPublishProblems(w.container, product, data)).toEqual([expect.stringContaining("at least one active variant")]);
		await w.variant({ productId: product, valueIds: [size.valueIds[1]!, colour.valueIds[0]!] });
		expect(await productPublishProblems(w.container, product, data)).toEqual([]);
	});

	it("refuses variants that miss an axis, take two values of one axis, or repeat a combination", async () => {
		const { w, typeId, material, size, colour } = await shirtWorld();
		const product = await w.product({ title: "Tee", typeId, hasVariants: true });
		const data = { [PRODUCT_FIELD.hasVariants]: true, [PRODUCT_FIELD.specs]: { [material.id]: "x" } };
		await w.variant({ productId: product, title: "Only size", valueIds: [size.valueIds[0]!] });
		await w.variant({ productId: product, title: "Two sizes", valueIds: [size.valueIds[0]!, size.valueIds[1]!, colour.valueIds[0]!] });
		await w.variant({ productId: product, title: "A", valueIds: [size.valueIds[2]!, colour.valueIds[1]!] });
		await w.variant({ productId: product, title: "B", valueIds: [colour.valueIds[1]!, size.valueIds[2]!] });
		const problems = (await productPublishProblems(w.container, product, data)).join(" | ");
		expect(problems).toContain('Variant "Only size": Pick a value for "Colour"');
		expect(problems).toContain('Variant "Two sizes": Pick one value for "Size", not 2');
		expect(problems).toContain('Variants "A" and "B" have the same options.');
	});

	it("refuses a misconfigured product type: a non-select axis, a required specification that is not specified", async () => {
		const w = createModelWorld();
		const free = await w.attribute({ name: "Free", inputType: "text" });
		const typeId = await w.productType({ name: "Odd", axes: [free.id], specs: [], required: [free.id] });
		const product = await w.product({ title: "Odd", sku: "O", typeId });
		const problems = (await productPublishProblems(w.container, product, { [PRODUCT_FIELD.sku]: "O" })).join(" | ");
		expect(problems).toContain("must be a select attribute");
		expect(problems).toContain("requires a specification that is not one of its specification attributes");
	});

	it("reports the relation cap instead of reading a partial variant list", async () => {
		const { w, typeId, material } = await shirtWorld();
		const product = await w.product({ title: "Tee", typeId, hasVariants: true });
		const relations = {
			...w.container.relations,
			children: async (...args: Parameters<typeof w.container.relations.children>) => ({ ...(await w.container.relations.children(...args)), hasMore: args[2] === "variants" }),
		};
		const container = { ...w.container, relations, catalog: (await import("../../adapters/emdash/content/catalog-repository.js")).createCatalogRepository(w.ctx.content, relations as never, w.slugs) };
		const problems = await productPublishProblems(container, product, { [PRODUCT_FIELD.hasVariants]: true, [PRODUCT_FIELD.specs]: { [material.id]: "x" } });
		expect(problems.join(" ")).toContain("holds more than 50 links");
	});

	it("words the refusal as one readable sentence a host accepts: titled, within 500 characters, no control characters", async () => {
		const { w, typeId } = await shirtWorld();
		const product = await w.product({ title: "Mug", typeId });
		const reason = (await productPublishRefusal(w.container, { id: product, data: { title: "Mug" } }))!;
		expect(reason.startsWith('Cannot publish "Mug": ')).toBe(true);
		expect(reason).toContain("Material");
		expect(reason).toContain("Add a SKU");
		expect(reason.length).toBeLessThanOrEqual(480);
		// eslint-disable-next-line no-control-regex
		expect(/[\u0000-\u001f\u007f]/.test(reason)).toBe(false);
		const long = await productPublishRefusal(w.container, { id: product, data: { title: "x".repeat(600) } });
		expect(long!.length).toBeLessThanOrEqual(480);
		expect(await productPublishRefusal(w.container, { data: {} })).toBeNull();
	});
});

describe("specification", () => {
	it("coerces each input type, rejects values the attribute does not have, and treats empty as unset", async () => {
		const w = createModelWorld();
		const select = await w.attribute({ name: "Fit", values: ["slim", "wide"] });
		const multi = await w.attribute({ name: "Uses", inputType: "multi_select", values: ["a", "b"] });
		const number = await w.attribute({ name: "Weight", inputType: "number" });
		const toggle = await w.attribute({ name: "Waterproof", inputType: "boolean" });
		const text = await w.attribute({ name: "Note", inputType: "text" });
		const load = async (id: string) => (await w.container.catalog.getAttribute(id))!;
		const [selectAttr, multiAttr, numberAttr, toggleAttr, textAttr] = [await load(select.id), await load(multi.id), await load(number.id), await load(toggle.id), await load(text.id)];
		expect(coerceSpecValue(selectAttr, select.valueIds[1])).toBe(select.valueIds[1]);
		expect(coerceSpecValue(selectAttr, "")).toBeUndefined();
		expect(() => coerceSpecValue(selectAttr, "not-a-value")).toThrow();
		expect(coerceSpecValue(multiAttr, [multi.valueIds[0]])).toEqual([multi.valueIds[0]]);
		expect(coerceSpecValue(multiAttr, [])).toBeUndefined();
		expect(() => coerceSpecValue(multiAttr, ["nope"])).toThrow();
		expect(coerceSpecValue(numberAttr, "12.5")).toBe(12.5);
		expect(() => coerceSpecValue(numberAttr, "heavy")).toThrow();
		expect(coerceSpecValue(toggleAttr, true)).toBe(true);
		expect(coerceSpecValue(toggleAttr, undefined)).toBeUndefined();
		expect(coerceSpecValue(textAttr, "  hi  ")).toBe("hi");
		expect(coerceSpecValue(textAttr, "   ")).toBeUndefined();
	});

	it("saves one value per specification attribute and re-shapes: attributes the type no longer lists are dropped", async () => {
		const w = createModelWorld();
		const fit = await w.attribute({ name: "Fit", values: ["slim", "wide"] });
		const note = await w.attribute({ name: "Note", inputType: "text" });
		const typeId = await w.productType({ name: "T", specs: [fit.id, note.id] });
		const productId = await w.product({ title: "P", sku: "P", typeId, specs: { stale: "gone" } });
		const model = await loadSpecificationModel(w.container, productId);
		expect(model.specs).toEqual({});
		expect(model.attributes.map((attribute) => attribute.name)).toEqual(["Fit", "Note"]);
		const specs = await saveSpecification(w.container, productId, { [fit.id]: fit.valueIds[0], [note.id]: "soft", ignored: "x" });
		expect(specs).toEqual({ [fit.id]: fit.valueIds[0], [note.id]: "soft" });
		const stored = w.ctx.content.entries(w.slugs.products).find((entry) => entry.id === productId)!.data[PRODUCT_FIELD.specs];
		expect(stored).toEqual({ [fit.id]: fit.valueIds[0], [note.id]: "soft" });
		// A type change re-shapes: the next save keeps only what the new type lists.
		const slim = await w.productType({ name: "Slim", specs: [note.id] });
		await w.ctx.fakeRelations.setParent(w.slugs.products, productId, PRODUCT_FIELD.productType, slim);
		expect((await loadSpecificationModel(w.container, productId)).specs).toEqual({ [note.id]: "soft" });
		expect(await saveSpecification(w.container, productId, { [note.id]: "rough", [fit.id]: fit.valueIds[1] })).toEqual({ [note.id]: "rough" });
	});

	it("refuses to save without a product type, and an unknown value", async () => {
		const w = createModelWorld();
		const fit = await w.attribute({ name: "Fit", values: ["slim"] });
		const untyped = await w.product({ title: "P", sku: "P" });
		expect(isCommerceError(await failure(saveSpecification(w.container, untyped, {})))).toBe(true);
		const typeId = await w.productType({ name: "T", specs: [fit.id] });
		const typed = await w.product({ title: "Q", sku: "Q", typeId });
		const refused = await failure(saveSpecification(w.container, typed, { [fit.id]: "not-a-value" }));
		expect(isCommerceError(refused) && refused.message).toContain("is not a value of");
	});
});

describe("derived variant fields", () => {
	it("derives options_key, an empty title and an empty SKU from the links, and writes only what differs", async () => {
		const { w, size, colour } = await shirtWorld();
		const productId = await w.product({ title: "Tee", sku: "TEE", typeId: undefined, hasVariants: true });
		const variantId = w.ctx.content.seedEntry(w.slugs.variants, { [VARIANT_FIELD.isActive]: true }, { status: "published" });
		await w.ctx.fakeRelations.setParent(w.slugs.variants, variantId, VARIANT_FIELD.product, productId);
		await w.ctx.fakeRelations.setChildren(w.slugs.variants, variantId, VARIANT_FIELD.optionValues, [size.valueIds[1]!, colour.valueIds[0]!]);
		await deriveVariantFields(w.container, variantId);
		const data = () => w.ctx.content.entries(w.slugs.variants).find((entry) => entry.id === variantId)!.data;
		expect(data()).toMatchObject({ [VARIANT_FIELD.optionsKey]: [size.valueIds[1], colour.valueIds[0]].sort().join("|"), [VARIANT_FIELD.title]: "Tee — M / Black", [VARIANT_FIELD.sku]: "TEE-M-BLK" });
		// A typed title and SKU stay; a changed link updates the key only.
		await w.ctx.content.update(w.slugs.variants, variantId, { [VARIANT_FIELD.title]: "Mine", [VARIANT_FIELD.sku]: "MY-SKU" });
		await w.ctx.fakeRelations.setChildren(w.slugs.variants, variantId, VARIANT_FIELD.optionValues, [size.valueIds[2]!, colour.valueIds[1]!]);
		await deriveVariantFields(w.container, variantId);
		expect(data()).toMatchObject({ [VARIANT_FIELD.optionsKey]: [size.valueIds[2], colour.valueIds[1]].sort().join("|"), [VARIANT_FIELD.title]: "Mine", [VARIANT_FIELD.sku]: "MY-SKU" });
	});

	it("does nothing for a deleted variant", async () => {
		const { w } = await shirtWorld();
		await expect(deriveVariantFields(w.container, "missing")).resolves.toBeUndefined();
	});
});

describe("price links", () => {
	it("accepts a price linked to exactly one of product and variant", async () => {
		const { w } = await shirtWorld();
		const productId = await w.product({ title: "P", sku: "P" });
		const variantId = await w.variant({ productId });
		expect(await checkPriceLinks(w.container, await w.price({ productId }))).toBe(true);
		expect(await checkPriceLinks(w.container, await w.price({ variantId }))).toBe(true);
	});

	it("marks a price with neither or both links as failed, with a readable error, keeping its Stripe id", async () => {
		const { w } = await shirtWorld();
		const productId = await w.product({ title: "P", sku: "P" });
		const variantId = await w.variant({ productId });
		const neither = await w.price({});
		const both = await w.price({ productId, variantId });
		await w.ctx.content.update(w.slugs.prices, both, { [PRICE_FIELD.stripePriceId]: "price_keep" });
		for (const id of [neither, both]) expect(await checkPriceLinks(w.container, id)).toBe(false);
		const data = (id: string) => w.ctx.content.entries(w.slugs.prices).find((entry) => entry.id === id)!.data;
		expect(data(neither)).toMatchObject({ [PRICE_FIELD.stripeSyncStatus]: "failed", [PRICE_FIELD.stripeSyncError]: PRICE_LINK_PROBLEM });
		expect(data(both)).toMatchObject({ [PRICE_FIELD.stripeSyncStatus]: "failed", [PRICE_FIELD.stripePriceId]: "price_keep" });
	});
});

describe("save checks (content:beforeSave field rules)", () => {
	const slugs = createModelWorld().slugs;

	it("rejects a swatch that is not #rgb or #rrggbb, and only when the field is part of the save", () => {
		expect(catalogSaveProblems(slugs, slugs.attributeValues, { label: "Black", swatch: "black" })).toEqual([expect.stringContaining("#rgb or #rrggbb")]);
		expect(catalogSaveProblems(slugs, slugs.attributeValues, { label: "Black", swatch: "#000" })).toEqual([]);
		expect(catalogSaveProblems(slugs, slugs.attributeValues, { label: "Black" })).toEqual([]);
		expect(catalogSaveProblems(slugs, slugs.attributeValues, { swatch: "" })).toEqual([]);
		expect(catalogSaveProblems(slugs, slugs.brands, { swatch: "nope" })).toEqual([]);
	});

	it("rejects a negative or fractional price on a product and a variant override, and lets empty and valid ones through", () => {
		for (const collection of [slugs.products, slugs.variants]) {
			expect(catalogSaveProblems(slugs, collection, { price: -1 })).toHaveLength(1);
			expect(catalogSaveProblems(slugs, collection, { price: 12.5 })).toHaveLength(1);
			expect(catalogSaveProblems(slugs, collection, { price: "abc" })).toHaveLength(1);
			expect(catalogSaveProblems(slugs, collection, { price: 0 })).toEqual([]);
			expect(catalogSaveProblems(slugs, collection, { price: 4900 })).toEqual([]);
			expect(catalogSaveProblems(slugs, collection, { price: null })).toEqual([]);
			expect(catalogSaveProblems(slugs, collection, { title: "x" })).toEqual([]);
		}
		expect(catalogSaveProblems(slugs, slugs.prices, { price: -1 })).toEqual([]);
	});
});
