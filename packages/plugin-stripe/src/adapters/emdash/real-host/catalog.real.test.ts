import { MediaRepository, SchemaRegistry, createContentAccessWithWrite, normalizeMediaValue } from "emdash";
import { describe, expect, it } from "vitest";

import { commerceOptionsSchema } from "../../../contracts/options.js";
import { createContainer, resetContainerMemo } from "../../../plugin/container.js";
import { deriveVariantFields } from "../../../services/catalog/derive-variant.js";
import { checkPriceLinks } from "../../../services/catalog/price-links.js";
import { productPublishProblems } from "../../../services/catalog/publish-guard.js";
import { loadSpecificationModel, saveSpecification } from "../../../services/catalog/specs.js";
import { syncManagedPrices } from "../../../services/catalog/managed-prices.js";
import { generateVariants } from "../../../services/catalog/variant-generator.js";
import { createCatalogReadService } from "../../../services/catalog-read.js";
import { createReadySchemaPort } from "../../../testing/fakes/schema-port.js";
import { createFakePaymentProvider, createFakePluginContext } from "../../../testing/index.js";
import { createCatalogRepository } from "../content/catalog-repository.js";
import { requireWritableContent } from "../content/repositories.js";
import { createEmDashRelations } from "../relations/emdash-relations.js";
import { RelationError } from "../relations/port.js";
import { buildSchemaDefinitions } from "../schema/collections/index.js";
import { ATTRIBUTE_FIELD, ATTRIBUTE_VALUE_FIELD, CATALOG_RELATION, CATEGORY_FIELD, PRICE_FIELD, PRODUCT_FIELD, PRODUCT_TYPE_FIELD, VARIANT_FIELD } from "../schema/field-names.js";
import { reconcileSchema } from "../schema/reconcile.js";
import { createRegistryPortFor } from "../schema/registry-port.js";
import { createRealDatabase } from "./host.js";

const options = commerceOptionsSchema.parse({ supportedCurrencies: ["pln"] });
const slugs = options.collections;
const schema = buildSchemaDefinitions(options);

/** A fresh database with the whole catalog schema reconciled, the repository, the relations port and a container over them. */
const setup = async () => {
	resetContainerMemo();
	const db = await createRealDatabase();
	const registry = new SchemaRegistry(db as never);
	await reconcileSchema(createRegistryPortFor(db as never), schema);
	const content = requireWritableContent(createContentAccessWithWrite(db as never, undefined, { revisions: true } as never));
	const relations = createEmDashRelations(async () => db as never);
	const catalog = createCatalogRepository(content, relations, slugs);
	const make = async (collection: string, data: Record<string, unknown>, references: Record<string, string[]> = {}, status = "published") =>
		(await relations.createWithReferences(collection, { data, status }, references)).id;
	// The plugin context is fake except content, which is the real database's, and relations, which are the real ones.
	const ctx = createFakePluginContext(schema.collections);
	Object.assign(ctx, { content });
	const container = createContainer(ctx, options, {}, {
		createSchemaPort: async () => createReadySchemaPort(schema.collections),
		createProvider: () => createFakePaymentProvider(),
		relations,
		env: {},
	});
	return { db, registry, content, relations, catalog, make, container };
};

describe("catalog schema on a real EmDash database", () => {
	it("creates the eight catalog collections with the intended visibility, folders and relations, and changes nothing on a second run", async () => {
		const { registry } = await setup();
		const hidden = (slug: string) => registry.getCollection(slug).then((collection) => collection!.hidden);
		for (const slug of [slugs.variants, slugs.prices, slugs.attributeValues]) expect(await hidden(slug), slug).toBe(true);
		for (const slug of [slugs.products, slugs.productTypes, slugs.attributes, slugs.brands, slugs.categories]) expect(await hidden(slug), slug).toBe(false);
		expect(await registry.getCollection(slugs.products)).toMatchObject({ group: "Catalog", sortOrder: 1000, routable: true });
		expect(await registry.getCollection(slugs.brands)).toMatchObject({ routable: true, urlPattern: "/shop/brand/{slug}" });
		expect(await registry.getCollection(slugs.categories)).toMatchObject({ routable: true, urlPattern: "/shop/c/{slug}" });
		const variantFields = (await registry.getCollectionWithFields(slugs.variants))!.fields;
		expect(variantFields.find((field) => field.slug === VARIANT_FIELD.product)).toMatchObject({ type: "reference", required: true, validation: { relation: CATALOG_RELATION.productVariants, relationSide: "child", targetCollection: slugs.products } });
		expect(variantFields.find((field) => field.slug === VARIANT_FIELD.optionValues)).toMatchObject({ validation: { relation: CATALOG_RELATION.variantOptionValues, relationSide: "parent", targetCollection: slugs.attributeValues } });
		expect((await registry.getCollectionWithFields(slugs.products))!.fields.map((field) => field.slug)).not.toContain("options");
	});

	it("accepts the one-sided relations (product type and variant option values have a field on one end only)", async () => {
		const { registry } = await setup();
		const typeField = (await registry.getCollectionWithFields(slugs.products))!.fields.find((field) => field.slug === PRODUCT_FIELD.productType);
		expect(typeField?.validation).toMatchObject({ relation: CATALOG_RELATION.productType, relationSide: "child", targetCollection: slugs.productTypes });
	});
});

describe("catalog repository round trip over relations (real SQLite)", () => {
	it("reads products, variants, prices and the vocabulary back through the relation edges", async () => {
		const { catalog, make } = await setup();
		const size = await make(slugs.attributes, { [ATTRIBUTE_FIELD.name]: "Size" });
		const sizeS = await make(slugs.attributeValues, { [ATTRIBUTE_VALUE_FIELD.label]: "S", [ATTRIBUTE_VALUE_FIELD.code]: "S" }, { [ATTRIBUTE_VALUE_FIELD.attribute]: [size] });
		const sizeM = await make(slugs.attributeValues, { [ATTRIBUTE_VALUE_FIELD.label]: "M", [ATTRIBUTE_VALUE_FIELD.swatch]: "#abc" }, { [ATTRIBUTE_VALUE_FIELD.attribute]: [size] });
		const material = await make(slugs.attributes, { [ATTRIBUTE_FIELD.name]: "Material", [ATTRIBUTE_FIELD.inputType]: "text" });
		const type = await make(slugs.productTypes, { [PRODUCT_TYPE_FIELD.name]: "Shirt" }, {
			[PRODUCT_TYPE_FIELD.variantAxes]: [size],
			[PRODUCT_TYPE_FIELD.allowedValues]: [sizeM],
			[PRODUCT_TYPE_FIELD.specAttributes]: [material, size],
			[PRODUCT_TYPE_FIELD.requiredSpecs]: [material],
		});
		const brand = await make(slugs.brands, { name: "Acme" });
		const home = await make(slugs.categories, { [CATEGORY_FIELD.name]: "Home" });
		const kitchen = await make(slugs.categories, { [CATEGORY_FIELD.name]: "Kitchen" }, { [CATEGORY_FIELD.parent]: [home] });
		const product = await make(
			slugs.products,
			{ [PRODUCT_FIELD.title]: "Shirt", [PRODUCT_FIELD.hasVariants]: true, [PRODUCT_FIELD.trackInventory]: true, [PRODUCT_FIELD.price]: 4900, [PRODUCT_FIELD.specs]: { [material]: "cotton" } },
			{ [PRODUCT_FIELD.productType]: [type], [PRODUCT_FIELD.brand]: [brand], [PRODUCT_FIELD.categories]: [home, kitchen] },
		);
		const variant = await make(slugs.variants, { [VARIANT_FIELD.title]: "M", [VARIANT_FIELD.sku]: "SH-M", [VARIANT_FIELD.price]: 5900, [VARIANT_FIELD.isActive]: true }, { [VARIANT_FIELD.product]: [product], [VARIANT_FIELD.optionValues]: [sizeM] });
		const onVariant = await make(slugs.prices, { [PRICE_FIELD.type]: "one_time", [PRICE_FIELD.unitAmount]: 4900, [PRICE_FIELD.currency]: "pln", [PRICE_FIELD.isDefault]: true }, { [PRICE_FIELD.variant]: [variant] });
		const onProduct = await make(slugs.prices, { [PRICE_FIELD.type]: "recurring", [PRICE_FIELD.interval]: "month", [PRICE_FIELD.unitAmount]: 900, [PRICE_FIELD.currency]: "pln" }, { [PRICE_FIELD.product]: [product] });

		expect(await catalog.getProduct(product)).toMatchObject({ title: "Shirt", hasVariants: true, price: 4900, typeId: type, brandId: brand, specs: { [material]: "cotton" }, inventory: { isTracked: true } });
		expect((await catalog.getProduct(product))!.categoryIds.sort()).toEqual([home, kitchen].sort());
		expect(await catalog.getVariant(variant)).toMatchObject({ productId: product, sku: "SH-M", price: 5900, optionValueIds: [sizeM], optionsKey: sizeM });
		expect((await catalog.listVariants(product)).map((item) => item.id)).toEqual([variant]);
		expect(await catalog.getPrice(onVariant)).toMatchObject({ productId: product, variantId: variant, unitAmount: 4900, isDefault: true });
		expect(await catalog.getPrice(onProduct)).toMatchObject({ productId: product, variantId: null, recurring: { interval: "month" } });
		expect((await catalog.listPrices(product)).map((item) => item.id).sort()).toEqual([onVariant, onProduct].sort());
		expect((await catalog.getPrices([onVariant, onProduct, "missing"])).size).toBe(2);

		expect(await catalog.getProductType(type)).toMatchObject({ name: "Shirt", variantAxisIds: [size], allowedValueIds: [sizeM], specAttributeIds: [material, size], requiredSpecIds: [material] });
		const attribute = (await catalog.getAttribute(size))!;
		expect(attribute.values.map((value) => [value.label, value.code, value.swatch])).toEqual([["S", "S", null], ["M", null, "#abc"]]);
		expect([...(await catalog.getAttributeValues([sizeS, sizeM])).values()].map((value) => value.attributeId)).toEqual([size, size]);
		expect(await catalog.getBrand(brand)).toMatchObject({ name: "Acme" });
		expect(await catalog.getCategory(kitchen)).toMatchObject({ name: "Kitchen", parentId: home });
	});

	it("hides an unpublished brand from the live product read, and keeps the helper entries readable whatever their status", async () => {
		const { catalog, make } = await setup();
		const brand = await make(slugs.brands, { name: "Hidden" }, {}, "draft");
		const product = await make(slugs.products, { [PRODUCT_FIELD.title]: "P" }, { [PRODUCT_FIELD.brand]: [brand] });
		expect((await catalog.getProduct(product))!.brandId).toBeNull();
		const variant = await make(slugs.variants, { [VARIANT_FIELD.title]: "Draft variant" }, { [VARIANT_FIELD.product]: [product] }, "draft");
		expect((await catalog.listVariants(product)).map((item) => item.id)).toEqual([variant]);
	});

	it("reads several relation fields of one entry in one call, with the limit per field, and refuses a field that is not a relation", async () => {
		const { make, relations } = await setup();
		const brand = await make(slugs.brands, { name: "Acme" });
		const home = await make(slugs.categories, { [CATEGORY_FIELD.name]: "Home" });
		const gifts = await make(slugs.categories, { [CATEGORY_FIELD.name]: "Gifts" });
		const product = await make(slugs.products, { [PRODUCT_FIELD.title]: "P" }, { [PRODUCT_FIELD.brand]: [brand], [PRODUCT_FIELD.categories]: [home, gifts] });
		const read = await relations.fields(slugs.products, product, [PRODUCT_FIELD.brand, PRODUCT_FIELD.categories, PRODUCT_FIELD.productType], { includeDrafts: false, limit: 1 });
		expect(read[PRODUCT_FIELD.brand]!.items.map((entry) => entry.id)).toEqual([brand]);
		expect(read[PRODUCT_FIELD.categories]).toMatchObject({ hasMore: true });
		expect(read[PRODUCT_FIELD.categories]!.items).toHaveLength(1);
		expect(read[PRODUCT_FIELD.productType]).toEqual({ items: [], hasMore: false });
		await expect(relations.fields(slugs.products, product, [PRODUCT_FIELD.title], { includeDrafts: false })).rejects.toBeInstanceOf(RelationError);
	});

	it("lets EmDash itself refuse the 51st variant, the 4th axis and a 4th option value: the limits a bounded read relies on", async () => {
		const { make, relations } = await setup();
		const product = await make(slugs.products, { [PRODUCT_FIELD.title]: "Many" });
		for (let index = 0; index < 50; index += 1) await make(slugs.variants, { [VARIANT_FIELD.title]: `v${index}` }, { [VARIANT_FIELD.product]: [product] });
		await expect(make(slugs.variants, { [VARIANT_FIELD.title]: "v50" }, { [VARIANT_FIELD.product]: [product] })).rejects.toBeInstanceOf(RelationError);
		const page = await relations.children(slugs.products, product, PRODUCT_FIELD.variants, { includeDrafts: true });
		expect(page.items).toHaveLength(50);
		expect(page.hasMore).toBe(false);

		const attributes = await Promise.all(Array.from({ length: 4 }, (_, index) => make(slugs.attributes, { [ATTRIBUTE_FIELD.name]: `A${index}` })));
		await expect(make(slugs.productTypes, { [PRODUCT_TYPE_FIELD.name]: "Four axes" }, { [PRODUCT_TYPE_FIELD.variantAxes]: attributes })).rejects.toBeInstanceOf(RelationError);
		const values = await Promise.all(Array.from({ length: 4 }, (_, index) => make(slugs.attributeValues, { [ATTRIBUTE_VALUE_FIELD.label]: `V${index}` })));
		const variant = await make(slugs.variants, { [VARIANT_FIELD.title]: "x" }, { [VARIANT_FIELD.product]: [await make(slugs.products, { [PRODUCT_FIELD.title]: "Other" })] });
		await expect(relations.setChildren(slugs.variants, variant, VARIANT_FIELD.optionValues, values)).rejects.toBeInstanceOf(RelationError);
	});
});

describe("catalog tools on a real EmDash database", () => {
	const shirtModel = async () => {
		const t = await setup();
		const size = await t.make(slugs.attributes, { [ATTRIBUTE_FIELD.name]: "Size" });
		const sizeValues = await Promise.all(["S", "M", "L"].map((label) => t.make(slugs.attributeValues, { [ATTRIBUTE_VALUE_FIELD.label]: label, [ATTRIBUTE_VALUE_FIELD.code]: label }, { [ATTRIBUTE_VALUE_FIELD.attribute]: [size] })));
		const colour = await t.make(slugs.attributes, { [ATTRIBUTE_FIELD.name]: "Colour", [ATTRIBUTE_FIELD.presentation]: "swatch" });
		const colourValues = await Promise.all(["Black", "White"].map((label) => t.make(slugs.attributeValues, { [ATTRIBUTE_VALUE_FIELD.label]: label, [ATTRIBUTE_VALUE_FIELD.code]: label.slice(0, 3).toUpperCase() }, { [ATTRIBUTE_VALUE_FIELD.attribute]: [colour] })));
		const material = await t.make(slugs.attributes, { [ATTRIBUTE_FIELD.name]: "Material", [ATTRIBUTE_FIELD.inputType]: "text" });
		const type = await t.make(slugs.productTypes, { [PRODUCT_TYPE_FIELD.name]: "Shirt" }, { [PRODUCT_TYPE_FIELD.variantAxes]: [size, colour], [PRODUCT_TYPE_FIELD.specAttributes]: [material], [PRODUCT_TYPE_FIELD.requiredSpecs]: [material] });
		const product = await t.make(slugs.products, { [PRODUCT_FIELD.title]: "Tee", [PRODUCT_FIELD.sku]: "TEE", [PRODUCT_FIELD.hasVariants]: true }, { [PRODUCT_FIELD.productType]: [type] });
		return { ...t, size, sizeValues, colour, colourValues, material, type, product };
	};

	it("generates the cartesian product, links every edge, skips existing combinations and refuses to pass 50", async () => {
		const t = await shirtModel();
		const selection = { [t.size]: t.sizeValues.slice(0, 2), [t.colour]: t.colourValues };
		expect(await generateVariants(t.container, t.product, selection)).toMatchObject({ created: 4, skipped: 0 });
		const variants = await t.catalog.listVariants(t.product);
		expect(variants.map((variant) => variant.title).sort()).toEqual(["Tee — M / Black", "Tee — M / White", "Tee — S / Black", "Tee — S / White"]);
		const small = variants.find((variant) => variant.title === "Tee — S / Black")!;
		expect(small).toMatchObject({ productId: t.product, sku: "TEE-S-BLA", isActive: true });
		expect(small.optionValueIds).toEqual([t.sizeValues[0], t.colourValues[0]]);
		expect(small.optionsKey).toBe([t.sizeValues[0], t.colourValues[0]].sort().join("|"));
		// The key is also stored on the entry (indexed column), and the entry is published.
		const stored = await t.content.get(slugs.variants, small.id);
		expect(stored).toMatchObject({ status: "published", data: { [VARIANT_FIELD.optionsKey]: small.optionsKey } });
		expect(await generateVariants(t.container, t.product, selection)).toMatchObject({ created: 0, skipped: 4 });
		expect(await generateVariants(t.container, t.product, { [t.size]: t.sizeValues, [t.colour]: t.colourValues })).toMatchObject({ created: 2, skipped: 4 });
	});

	it("passes the publish guard once the specification, the SKU and an active variant are there, and names what is missing before", async () => {
		const t = await shirtModel();
		const data = (specs?: Record<string, unknown>) => ({ [PRODUCT_FIELD.hasVariants]: true, ...(specs ? { [PRODUCT_FIELD.specs]: specs } : {}) });
		expect((await productPublishProblems(t.container, t.product, data())).join(" | ")).toContain("Fill the required specification: Material");
		expect((await productPublishProblems(t.container, t.product, data({ [t.material]: "cotton" }))).join(" | ")).toContain("at least one active variant");
		await generateVariants(t.container, t.product, { [t.size]: [t.sizeValues[0]!], [t.colour]: [t.colourValues[0]!] });
		expect(await productPublishProblems(t.container, t.product, data({ [t.material]: "cotton" }))).toEqual([]);
		const duplicate = await t.make(slugs.variants, { [VARIANT_FIELD.title]: "Copy" }, { [VARIANT_FIELD.product]: [t.product], [VARIANT_FIELD.optionValues]: [t.colourValues[0]!, t.sizeValues[0]!] });
		expect((await productPublishProblems(t.container, t.product, data({ [t.material]: "cotton" }))).join(" | ")).toContain("have the same options");
		expect(duplicate).toBeTruthy();
	});

	it("saves the specification and reads it back, re-shaped to the type", async () => {
		const t = await shirtModel();
		expect(await saveSpecification(t.container, t.product, { [t.material]: "wool" })).toEqual({ [t.material]: "wool" });
		expect((await loadSpecificationModel(t.container, t.product)).specs).toEqual({ [t.material]: "wool" });
	});

	it("derives the options key, title and SKU of a variant an editor linked by hand, and flags a price linked to neither parent", async () => {
		const t = await shirtModel();
		const variant = await t.make(slugs.variants, { [VARIANT_FIELD.isActive]: true }, { [VARIANT_FIELD.product]: [t.product], [VARIANT_FIELD.optionValues]: [t.sizeValues[2]!, t.colourValues[1]!] });
		await deriveVariantFields(t.container, variant);
		expect((await t.content.get(slugs.variants, variant))!.data).toMatchObject({ [VARIANT_FIELD.title]: "Tee — L / White", [VARIANT_FIELD.sku]: "TEE-L-WHI", [VARIANT_FIELD.optionsKey]: [t.sizeValues[2], t.colourValues[1]].sort().join("|") });

		const orphan = await t.make(slugs.prices, { [PRICE_FIELD.type]: "one_time", [PRICE_FIELD.unitAmount]: 100, [PRICE_FIELD.currency]: "pln" });
		expect(await checkPriceLinks(t.container, orphan)).toBe(false);
		expect((await t.content.get(slugs.prices, orphan))!.data).toMatchObject({ [PRICE_FIELD.stripeSyncStatus]: "failed" });
		const linked = await t.make(slugs.prices, { [PRICE_FIELD.type]: "one_time", [PRICE_FIELD.unitAmount]: 100, [PRICE_FIELD.currency]: "pln" }, { [PRICE_FIELD.product]: [t.product] });
		expect(await checkPriceLinks(t.container, linked)).toBe(true);
	});
});

describe("media-library images and galleries on a real EmDash database", () => {
	/** An uploaded media row and the value EmDash stores for it: `normalizeMediaValue` over a local provider reading that row. */
	const upload = async (db: Awaited<ReturnType<typeof setup>>["db"], filename: string, alt: string) => {
		const repo = new MediaRepository(db as never);
		const row = await repo.create({ filename, mimeType: "image/jpeg", width: 1200, height: 800, storageKey: `${filename}-key.jpg`, alt });
		const provider = {
			get: async (id: string) => {
				const item = await repo.findById(id);
				return item ? { id: item.id, filename: item.filename, mimeType: item.mimeType, width: item.width ?? undefined, height: item.height ?? undefined, alt: item.alt ?? undefined, meta: { storageKey: item.storageKey } } : null;
			},
		};
		const value = await normalizeMediaValue({ provider: "local", id: row.id, alt }, () => provider as never);
		return { row, value: value! };
	};

	it("adds the gallery repeater (image + alt sub-fields) to an existing products and variants collection", async () => {
		const db = await createRealDatabase();
		const registry = new SchemaRegistry(db as never);
		const port = createRegistryPortFor(db as never);
		const withoutGallery = { ...schema, collections: schema.collections.map((collection) => ({ ...collection, fields: collection.fields.filter((field) => field.slug !== "gallery") })) };
		await reconcileSchema(port, withoutGallery);
		expect((await registry.getCollectionWithFields(slugs.products))!.fields.some((field) => field.slug === PRODUCT_FIELD.gallery)).toBe(false);
		await reconcileSchema(port, schema);
		for (const slug of [slugs.products, slugs.variants]) {
			const gallery = (await registry.getCollectionWithFields(slug))!.fields.find((field) => field.slug === "gallery");
			expect(gallery, slug).toMatchObject({ type: "repeater" });
			expect(gallery!.validation?.subFields).toEqual([
				expect.objectContaining({ slug: "image", type: "image" }),
				expect.objectContaining({ slug: "alt", type: "string" }),
			]);
			expect(gallery!.validation?.subFields?.some((sub) => sub.required)).toBe(false);
		}
	});

	it("serves a media-library value (provider local, no src) and a gallery of them through the storefront API", async () => {
		const t = await setup();
		const front = await upload(t.db, "front", "Front");
		const side = await upload(t.db, "side", "Side");
		// The precondition of the bug: EmDash keeps a local value without `src`.
		expect(front.value).toMatchObject({ provider: "local", id: front.row.id, meta: { storageKey: "front-key.jpg" } });
		expect(front.value.src).toBeUndefined();
		const product = await t.make(slugs.products, {
			[PRODUCT_FIELD.title]: "Bottle",
			[PRODUCT_FIELD.sku]: "BTL",
			[PRODUCT_FIELD.price]: 4900,
			[PRODUCT_FIELD.image]: front.value,
			[PRODUCT_FIELD.gallery]: [{ image: side.value, alt: "Side view" }, { alt: "empty row" }],
		});
		await syncManagedPrices(t.container, { entity: "product", id: product });
		const stored = (await t.content.get(slugs.products, product))!;
		expect(stored.data[PRODUCT_FIELD.gallery]).toEqual([{ image: side.value, alt: "Side view" }, { alt: "empty row" }]);
		const card = (await createCatalogReadService(t.container).products({})).items.find((item) => item.id === product)!;
		expect(card.images).toEqual([
			{ url: "/_emdash/api/media/file/front-key.jpg", alt: "Front", width: 1200, height: 800 },
			{ url: "/_emdash/api/media/file/side-key.jpg", alt: "Side view", width: 1200, height: 800 },
		]);
	});
});

