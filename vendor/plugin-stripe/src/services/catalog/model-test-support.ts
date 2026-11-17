import { buildCollectionDefinitions } from "../../adapters/emdash/schema/collections.js";
import { ATTRIBUTE_FIELD, ATTRIBUTE_VALUE_FIELD, BRAND_FIELD, PRICE_FIELD, PRODUCT_FIELD, PRODUCT_TYPE_FIELD, VARIANT_FIELD } from "../../adapters/emdash/schema/field-names.js";
import { resetEnsureSchemaMemo } from "../../adapters/emdash/schema/reconcile.js";
import { commerceOptionsSchema } from "../../contracts/options.js";
import { createContainer, resetContainerMemo, type CommerceContainer, type ContainerDeps } from "../../plugin/container.js";
import { createReadySchemaPort } from "../../testing/fakes/schema-port.js";
import { createFakePaymentProvider, createFakePluginContext, type FakePaymentProvider, type FakePluginContext } from "../../testing/index.js";

/**
 * A container over fake content and the in-memory relations (which share the fake content's entries), plus builders for
 * the product model: attributes with values, product types, products, variants and prices. Everything is published so
 * live reads see it, like entries the plugin creates.
 */
export interface ModelWorld {
	ctx: FakePluginContext;
	container: CommerceContainer;
	provider: FakePaymentProvider;
	/** The deps the container was built with (hand them to `createStripeCommercePlugin` to run its routes and hooks on the same world). */
	deps: ContainerDeps;
	slugs: ReturnType<typeof commerceOptionsSchema.parse>["collections"];
	attribute(input: { name: string; inputType?: string; presentation?: string; values?: Array<string | { label: string; code?: string; swatch?: string }>; storefrontLabel?: string }): Promise<{ id: string; valueIds: string[] }>;
	productType(input: { name: string; axes?: string[]; allowed?: string[]; specs?: string[]; required?: string[] }): Promise<string>;
	brand(name: string): Promise<string>;
	product(input: { title?: string; sku?: string; typeId?: string; hasVariants?: boolean; specs?: Record<string, unknown>; slug?: string; price?: number }): Promise<string>;
	variant(input: { productId: string; title?: string; valueIds?: string[]; isActive?: boolean; sku?: string; price?: number }): Promise<string>;
	price(input: { productId?: string; variantId?: string; amount?: number }): Promise<string>;
	variantsOf(productId: string): Array<{ id: string; data: Record<string, unknown> }>;
}

export const createModelWorld = (): ModelWorld => {
	resetEnsureSchemaMemo();
	resetContainerMemo();
	const options = commerceOptionsSchema.parse({ supportedCurrencies: ["pln"] });
	const slugs = options.collections;
	const definitions = buildCollectionDefinitions(slugs, options.supportedCurrencies);
	const ctx = createFakePluginContext(definitions);
	const provider = createFakePaymentProvider();
	const deps: ContainerDeps = {
		createSchemaPort: async () => createReadySchemaPort(definitions),
		createProvider: () => provider,
		relations: ctx.fakeRelations,
		env: { STRIPE_SECRET_KEY: "sk_test_x" },
	};
	const container = createContainer(ctx, options, {}, deps);
	const content = ctx.content;
	const relations = ctx.fakeRelations;
	const seed = (collection: string, data: Record<string, unknown>, slug?: string) => content.seedEntry(collection, data, { status: "published", ...(slug ? { slug } : {}) });
	let counter = 0;
	const productIds = new Map<string, string>();

	return {
		ctx,
		container,
		provider,
		deps,
		slugs,
		async attribute({ name, inputType = "select", presentation = "buttons", values = [], storefrontLabel }) {
			const id = seed(slugs.attributes, { [ATTRIBUTE_FIELD.name]: name, [ATTRIBUTE_FIELD.inputType]: inputType, [ATTRIBUTE_FIELD.presentation]: presentation, ...(storefrontLabel ? { [ATTRIBUTE_FIELD.storefrontLabel]: storefrontLabel } : {}) });
			const valueIds = values.map((value) => {
				const spec = typeof value === "string" ? { label: value } : value;
				return seed(slugs.attributeValues, { [ATTRIBUTE_VALUE_FIELD.label]: spec.label, ...("code" in spec && spec.code ? { [ATTRIBUTE_VALUE_FIELD.code]: spec.code } : {}), ...("swatch" in spec && spec.swatch ? { [ATTRIBUTE_VALUE_FIELD.swatch]: spec.swatch } : {}) });
			});
			await relations.setChildren(slugs.attributes, id, ATTRIBUTE_FIELD.values, valueIds);
			return { id, valueIds };
		},
		async productType({ name, axes = [], allowed = [], specs = [], required = [] }) {
			const id = seed(slugs.productTypes, { [PRODUCT_TYPE_FIELD.name]: name });
			await relations.setChildren(slugs.productTypes, id, PRODUCT_TYPE_FIELD.variantAxes, axes);
			await relations.setChildren(slugs.productTypes, id, PRODUCT_TYPE_FIELD.allowedValues, allowed);
			await relations.setChildren(slugs.productTypes, id, PRODUCT_TYPE_FIELD.specAttributes, specs);
			await relations.setChildren(slugs.productTypes, id, PRODUCT_TYPE_FIELD.requiredSpecs, required);
			return id;
		},
		brand: async (name) => seed(slugs.brands, { [BRAND_FIELD.name]: name }),
		async product({ title = "Shirt", sku, typeId, hasVariants = false, specs, slug, price }) {
			counter += 1;
			const id = seed(
				slugs.products,
				{
					[PRODUCT_FIELD.title]: title,
					[PRODUCT_FIELD.hasVariants]: hasVariants,
					...(sku ? { [PRODUCT_FIELD.sku]: sku } : {}),
					...(specs ? { [PRODUCT_FIELD.specs]: specs } : {}),
					...(price !== undefined ? { [PRODUCT_FIELD.price]: price } : {}),
				},
				slug ?? `product-${counter}`,
			);
			if (typeId) await relations.setParent(slugs.products, id, PRODUCT_FIELD.productType, typeId);
			return id;
		},
		async variant({ productId, title = "Variant", valueIds = [], isActive = true, sku, price }) {
			const id = seed(slugs.variants, { [VARIANT_FIELD.title]: title, [VARIANT_FIELD.isActive]: isActive, ...(sku ? { [VARIANT_FIELD.sku]: sku } : {}), ...(price !== undefined ? { [VARIANT_FIELD.price]: price } : {}) });
			await relations.setParent(slugs.variants, id, VARIANT_FIELD.product, productId);
			productIds.set(id, productId);
			await relations.setChildren(slugs.variants, id, VARIANT_FIELD.optionValues, valueIds);
			return id;
		},
		async price({ productId, variantId, amount = 1000 }) {
			const id = seed(slugs.prices, { [PRICE_FIELD.type]: "one_time", [PRICE_FIELD.unitAmount]: amount, [PRICE_FIELD.currency]: "pln" });
			if (productId) await relations.setParent(slugs.prices, id, PRICE_FIELD.product, productId);
			if (variantId) await relations.setParent(slugs.prices, id, PRICE_FIELD.variant, variantId);
			return id;
		},
		variantsOf: (productId) => content.entries(slugs.variants).filter((entry) => productIds.get(entry.id) === productId).map((entry) => ({ id: entry.id, data: entry.data })),
	};
};
