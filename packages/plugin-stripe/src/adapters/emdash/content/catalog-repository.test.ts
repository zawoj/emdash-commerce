import { describe, expect, it } from "vitest";

import { isCommerceError } from "../../../core/errors.js";
import { createModelWorld } from "../../../services/catalog/model-test-support.js";
import { ATTRIBUTE_FIELD, CATEGORY_FIELD, PRICE_FIELD, PRODUCT_FIELD, VARIANT_FIELD } from "../schema/field-names.js";
import { portableTextToPlainText, parseSpecs, toPrice, toProduct, toVariant } from "./catalog-mapper.js";
import { createCatalogRepository } from "./catalog-repository.js";
import type { RelationsPort } from "../relations/port.js";

const entry = (data: Record<string, unknown>) => ({ id: "x", slug: null, status: "draft", data, createdAt: "", updatedAt: "" });

describe("catalog repository over content and relations", () => {
	it("maps a product with its type, brand, categories, price, SKU, specs, image, tax code and inventory policy", async () => {
		const w = createModelWorld();
		const type = await w.productType({ name: "Mug" });
		const brand = await w.brand("Acme");
		const category = w.ctx.content.seedEntry(w.slugs.categories, { [CATEGORY_FIELD.name]: "Kitchen" }, { status: "published" });
		const other = w.ctx.content.seedEntry(w.slugs.categories, { [CATEGORY_FIELD.name]: "Gifts" }, { status: "published" });
		const id = w.ctx.content.seedEntry(
			w.slugs.products,
			{
				[PRODUCT_FIELD.title]: "Mug",
				[PRODUCT_FIELD.description]: [{ _type: "block", children: [{ _type: "span", text: "Hand " }, { _type: "span", text: "made." }] }, { _type: "block", children: [{ text: "Dishwasher safe" }] }],
				[PRODUCT_FIELD.image]: { src: "/_emdash/api/media/file/mug.jpg", alt: "Mug" },
				[PRODUCT_FIELD.hasVariants]: false,
				[PRODUCT_FIELD.trackInventory]: true,
				[PRODUCT_FIELD.taxCode]: "txcd_99999999",
				[PRODUCT_FIELD.price]: 4900,
				[PRODUCT_FIELD.sku]: "MUG-1",
				[PRODUCT_FIELD.specs]: { a: "x", b: ["y"], c: 2, d: true, junk: { nested: 1 } },
			},
			{ status: "published", slug: "mug" },
		);
		await w.ctx.fakeRelations.setParent(w.slugs.products, id, PRODUCT_FIELD.productType, type);
		await w.ctx.fakeRelations.setParent(w.slugs.products, id, PRODUCT_FIELD.brand, brand);
		await w.ctx.fakeRelations.setChildren(w.slugs.products, id, PRODUCT_FIELD.categories, [category, other]);
		expect(await w.container.catalog.getProduct(id)).toEqual({
			id,
			slug: "mug",
			title: "Mug",
			description: "Hand made.\nDishwasher safe",
			imageUrls: ["/_emdash/api/media/file/mug.jpg"],
			isPublished: true,
			hasVariants: false,
			inventory: { isTracked: true, allowsBackorder: false },
			taxCode: "txcd_99999999",
			price: 4900,
			sku: "MUG-1",
			typeId: type,
			brandId: brand,
			categoryIds: [category, other],
			specs: { a: "x", b: ["y"], c: 2, d: true },
		});
		expect(await w.container.catalog.getProduct("nope")).toBeNull();
	});

	it("reads a draft product as unpublished, with no links and a null price", async () => {
		const w = createModelWorld();
		const id = w.ctx.content.seedEntry(w.slugs.products, { [PRODUCT_FIELD.title]: "Draft" });
		expect(await w.container.catalog.getProduct(id)).toMatchObject({ isPublished: false, typeId: null, brandId: null, categoryIds: [], price: null, sku: null, specs: {} });
	});

	it("maps a variant with its product, option values and key, price override and image; an orphan reads as missing", async () => {
		const w = createModelWorld();
		const size = await w.attribute({ name: "Size", values: ["M"] });
		const colour = await w.attribute({ name: "Colour", values: ["Black"] });
		const productId = await w.product({ title: "Shirt", sku: "SH" });
		const variantId = await w.variant({ productId, title: "M / Black", valueIds: [size.valueIds[0]!, colour.valueIds[0]!], sku: "SH-M", price: 5900 });
		await w.ctx.content.update(w.slugs.variants, variantId, { [VARIANT_FIELD.image]: { src: "/m.jpg" } });
		expect(await w.container.catalog.getVariant(variantId)).toEqual({
			id: variantId,
			productId,
			title: "M / Black",
			sku: "SH-M",
			optionValueIds: [size.valueIds[0], colour.valueIds[0]],
			optionsKey: [size.valueIds[0], colour.valueIds[0]].sort().join("|"),
			price: 5900,
			imageUrls: ["/m.jpg"],
			isActive: true,
			inventory: { isTracked: false, allowsBackorder: false },
		});
		const orphan = w.ctx.content.seedEntry(w.slugs.variants, { [VARIANT_FIELD.title]: "orphan" }, { status: "published" });
		expect(await w.container.catalog.getVariant(orphan)).toBeNull();
		expect(await w.container.catalog.getVariant("missing")).toBeNull();
	});

	it("lists the variants of a product in order, and the prices of the product and of each variant, resolving a variant price's product", async () => {
		const w = createModelWorld();
		const productId = await w.product({ title: "Shirt", sku: "SH" });
		const other = await w.product({ title: "Other", sku: "OT" });
		const first = await w.variant({ productId, title: "First" });
		const second = await w.variant({ productId, title: "Second" });
		await w.variant({ productId: other, title: "Elsewhere" });
		await w.ctx.fakeRelations.setChildren(w.slugs.products, productId, PRODUCT_FIELD.variants, [second, first]);
		expect((await w.container.catalog.listVariants(productId)).map((variant) => variant.title)).toEqual(["Second", "First"]);

		const onProduct = await w.price({ productId, amount: 1000 });
		const onVariant = await w.price({ variantId: first, amount: 900 });
		await w.price({ productId: other, amount: 5 });
		const prices = await w.container.catalog.listPrices(productId);
		expect(prices.map((price) => price.id).sort()).toEqual([onProduct, onVariant].sort());
		expect(await w.container.catalog.getPrice(onVariant)).toMatchObject({ productId, variantId: first, unitAmount: 900 });
		expect(await w.container.catalog.getPrice(onProduct)).toMatchObject({ productId, variantId: null });
		const many = await w.container.catalog.getPrices([onProduct, onVariant, "missing", onProduct]);
		expect([...many.keys()].sort()).toEqual([onProduct, onVariant].sort());
	});

	it("reads a price with neither link as missing (it cannot be priced)", async () => {
		const w = createModelWorld();
		const lonely = await w.price({});
		expect(await w.container.catalog.getPrice(lonely)).toBeNull();
	});

	it("reads a product type, an attribute with its ordered values, values by id, a brand and a category with its parent", async () => {
		const w = createModelWorld();
		const size = await w.attribute({ name: "Size", storefrontLabel: "Your size", presentation: "dropdown", values: [{ label: "S", code: "S" }, { label: "M" }] });
		const material = await w.attribute({ name: "Material", inputType: "text" });
		const typeId = await w.productType({ name: "Shirt", axes: [size.id], allowed: [size.valueIds[1]!], specs: [material.id, size.id], required: [material.id] });
		expect(await w.container.catalog.getProductType(typeId)).toEqual({
			id: typeId,
			name: "Shirt",
			code: null,
			variantAxisIds: [size.id],
			allowedValueIds: [size.valueIds[1]],
			specAttributeIds: [material.id, size.id],
			requiredSpecIds: [material.id],
		});
		const attribute = (await w.container.catalog.getAttribute(size.id))!;
		expect(attribute).toMatchObject({ name: "Size", storefrontLabel: "Your size", inputType: "select", presentation: "dropdown", isFilterable: false });
		expect(attribute.values.map((value) => [value.label, value.code])).toEqual([["S", "S"], ["M", null]]);
		expect((await w.container.catalog.getAttribute(material.id))!.storefrontLabel).toBe("Material");
		const values = await w.container.catalog.getAttributeValues([...size.valueIds, size.valueIds[0]!, "missing"]);
		expect([...values.keys()].sort()).toEqual([...size.valueIds].sort());
		expect(values.get(size.valueIds[0]!)).toMatchObject({ attributeId: size.id, label: "S" });

		const brand = await w.brand("Acme");
		expect(await w.container.catalog.getBrand(brand)).toMatchObject({ id: brand, name: "Acme" });
		const parent = w.ctx.content.seedEntry(w.slugs.categories, { [CATEGORY_FIELD.name]: "Home" }, { status: "published", slug: "home" });
		const child = w.ctx.content.seedEntry(w.slugs.categories, { [CATEGORY_FIELD.name]: "Kitchen" }, { status: "published", slug: "kitchen" });
		await w.ctx.fakeRelations.setParent(w.slugs.categories, child, CATEGORY_FIELD.parent, parent);
		expect(await w.container.catalog.getCategory(child)).toMatchObject({ slug: "kitchen", name: "Kitchen", parentId: parent });
		expect((await w.container.catalog.getCategory(parent))!.parentId).toBeNull();
		for (const missing of [w.container.catalog.getProductType("x"), w.container.catalog.getAttribute("x"), w.container.catalog.getBrand("x"), w.container.catalog.getCategory("x")]) {
			expect(await missing).toBeNull();
		}
	});

	it("finds a published product by slug, scanning pages, and pages products", async () => {
		const w = createModelWorld();
		for (let index = 0; index < 120; index += 1) w.ctx.content.seedEntry(w.slugs.products, { [PRODUCT_FIELD.title]: `Item ${index}` }, { status: "published" });
		w.ctx.content.seedEntry(w.slugs.products, { [PRODUCT_FIELD.title]: "Secret" }, { slug: "secret", status: "draft" });
		const target = w.ctx.content.seedEntry(w.slugs.products, { [PRODUCT_FIELD.title]: "Target" }, { slug: "target", status: "published" });
		expect((await w.container.catalog.getProductBySlug("target"))?.id).toBe(target);
		expect(await w.container.catalog.getProductBySlug("secret")).toBeNull();
		expect(await w.container.catalog.getProductBySlug("nope")).toBeNull();
		const first = await w.container.catalog.listProducts(null, 50);
		const second = await w.container.catalog.listProducts(first.cursor, 50);
		const third = await w.container.catalog.listProducts(second.cursor, 50);
		expect([first.items.length, second.items.length, third.items.length]).toEqual([50, 50, 22]);
		expect(third.cursor).toBeNull();
	});
});

describe("the 50-link cap", () => {
	/** Relations that report more links than one page for the named field, like a host with a field of 51+ links. */
	const overflowing = (inner: RelationsPort, field: string): RelationsPort => ({
		...inner,
		children: async (...args) => ({ ...(await inner.children(...args)), hasMore: args[2] === field }),
		fields: async (...args) => Object.fromEntries(Object.entries(await inner.fields(...args)).map(([name, page]) => [name, { ...page, hasMore: name === field }])),
	});

	const failureOf = async (promise: Promise<unknown>) => {
		try {
			await promise;
		} catch (error) {
			return error;
		}
		throw new Error("expected the read to fail");
	};

	it.each([
		["variants of a product", PRODUCT_FIELD.variants, (catalog: ReturnType<typeof createCatalogRepository>, ids: { product: string }) => catalog.listVariants(ids.product)],
		["prices of a product", PRODUCT_FIELD.prices, (catalog: ReturnType<typeof createCatalogRepository>, ids: { product: string }) => catalog.listPrices(ids.product)],
		["categories of a product", PRODUCT_FIELD.categories, (catalog: ReturnType<typeof createCatalogRepository>, ids: { product: string }) => catalog.getProduct(ids.product)],
		["values of an attribute", ATTRIBUTE_FIELD.values, (catalog: ReturnType<typeof createCatalogRepository>, ids: { attribute: string }) => catalog.getAttribute(ids.attribute)],
		["axes of a type", "variant_axes", (catalog: ReturnType<typeof createCatalogRepository>, ids: { type: string }) => catalog.getProductType(ids.type)],
		["prices of a variant", VARIANT_FIELD.prices, (catalog: ReturnType<typeof createCatalogRepository>, ids: { product: string }) => catalog.listPrices(ids.product)],
	])("throws CATALOG_LIMIT_EXCEEDED instead of truncating the %s", async (_label, field, read) => {
		const w = createModelWorld();
		const attribute = await w.attribute({ name: "A", values: ["v"] });
		const type = await w.productType({ name: "T", axes: [attribute.id] });
		const product = await w.product({ title: "P", sku: "P", typeId: type });
		await w.variant({ productId: product });
		const catalog = createCatalogRepository(w.ctx.content, overflowing(w.ctx.fakeRelations, field), w.slugs);
		const error = await failureOf((read as (c: typeof catalog, ids: { product: string; attribute: string; type: string }) => Promise<unknown>)(catalog, { product, attribute: attribute.id, type }));
		expect(isCommerceError(error) && error.kind).toBe("catalogLimitExceeded");
		expect((error as Error).message).toContain("more than 50 links");
		// The same read succeeds when the field is within one page.
		await expect(read(createCatalogRepository(w.ctx.content, w.ctx.fakeRelations, w.slugs), { product, attribute: attribute.id, type } as never)).resolves.toBeDefined();
	});
});

describe("catalog mapping", () => {
	it("reads unusable prices and variants as missing instead of guessing", () => {
		const links = { productId: "p", variantId: null };
		expect(toPrice(entry({ [PRICE_FIELD.unitAmount]: 100, [PRICE_FIELD.currency]: "pln" }), { productId: null, variantId: null })).toBeNull(); // no product
		expect(toPrice(entry({ [PRICE_FIELD.currency]: "pln" }), links)).toBeNull(); // no amount
		expect(toPrice(entry({ [PRICE_FIELD.unitAmount]: 100, [PRICE_FIELD.currency]: "zloty" }), links)).toBeNull();
		expect(toPrice(entry({ [PRICE_FIELD.unitAmount]: 100, [PRICE_FIELD.currency]: "pln", [PRICE_FIELD.type]: "recurring" }), links)).toBeNull();
		expect(toPrice(entry({ [PRICE_FIELD.unitAmount]: -5, [PRICE_FIELD.currency]: "pln" }), links)).toBeNull();
		expect(toVariant(entry({ [VARIANT_FIELD.title]: "orphan" }), { productId: null, optionValueIds: [] })).toBeNull();
		expect(toPrice(entry({ [PRICE_FIELD.unitAmount]: 100, [PRICE_FIELD.currency]: "PLN" }), links)?.productId).toBe("p");
	});

	it("maps recurring terms and defaults for fields never written", () => {
		const price = toPrice(
			entry({ [PRICE_FIELD.type]: "recurring", [PRICE_FIELD.unitAmount]: 900, [PRICE_FIELD.currency]: "eur", [PRICE_FIELD.interval]: "month", [PRICE_FIELD.trialDays]: 14, [PRICE_FIELD.lookupKey]: "monthly", [PRICE_FIELD.taxBehavior]: "inclusive" }),
			{ productId: "p", variantId: "v" },
		)!;
		expect(price).toMatchObject({ productId: "p", variantId: "v", recurring: { interval: "month", intervalCount: 1, trialDays: 14 }, lookupKey: "monthly", taxBehavior: "inclusive", isActive: true, isDefault: false });
	});

	it("treats a price and a price override as minor units: whole and not negative, else unset", () => {
		const product = (price: unknown) => toProduct(entry({ [PRODUCT_FIELD.title]: "P", [PRODUCT_FIELD.price]: price })).price;
		expect([product(4900), product("4900"), product(0), product(-1), product(null), product(undefined)]).toEqual([4900, 4900, 0, null, null, null]);
	});

	it("flattens Portable Text and tolerates plain strings and junk, and parses only well-formed specs", () => {
		expect(portableTextToPlainText(null)).toBeNull();
		expect(portableTextToPlainText([])).toBeNull();
		expect(portableTextToPlainText("  plain  ")).toBe("plain");
		expect(portableTextToPlainText([{ children: [{ text: "a" }] }, "junk", { children: "no" }])).toBe("a");
		expect(parseSpecs(null)).toEqual({});
		expect(parseSpecs([1])).toEqual({});
		expect(parseSpecs({ a: "x", b: null, c: [1], d: ["ok"] })).toEqual({ a: "x", d: ["ok"] });
	});
});
