import { compact } from "../../adapters/emdash/content/values.js";
import { VARIANT_FIELD } from "../../adapters/emdash/schema/field-names.js";
import {
	MAX_VARIANTS_PER_PRODUCT,
	axisValuesOf,
	combinationsOf,
	optionsKeyOf,
	planGeneration,
	productTypeProblems,
	variantSkuOf,
	variantTitleOf,
	type AxisSelection,
} from "../../core/catalog-rules.js";
import type { Product } from "../../core/catalog.js";
import { CommerceError } from "../../core/errors.js";
import type { Attribute, ProductType } from "../../core/product-type.js";
import type { CommerceContainer } from "../../plugin/container.js";
import { createCatalogSyncService } from "../catalog-sync.js";
import { createEventPublisher } from "../outbox.js";
import { requireEditorProduct } from "./editor-read.js";

/** What a product's Variants panel offers: the type's axes with the values an editor may tick, and what exists. */
export interface VariantGeneratorModel {
	product: Product;
	type: ProductType | null;
	axes: Array<{ attribute: Attribute; values: Attribute["values"] }>;
	/** Why variants cannot be generated yet (no type, no axes, a misconfigured type); empty = ready. */
	blockers: string[];
	variants: Array<{ id: string; title: string; sku: string | null; price: number | null; stock: number | null; isActive: boolean; optionsKey: string }>;
}

export const loadVariantGeneratorModel = async (container: CommerceContainer, productId: string): Promise<VariantGeneratorModel> => {
	const product = await requireEditorProduct(container, productId);
	const type = product.typeId ? await container.catalog.getProductType(product.typeId) : null;
	const loaded = type ? await Promise.all(type.variantAxisIds.map((id) => container.catalog.getAttribute(id))) : [];
	const attributes = loaded.filter((attribute): attribute is Attribute => attribute !== null);
	const blockers: string[] = [];
	if (!type) blockers.push("Choose a product type for this product and save, then come back to generate variants.");
	else if (attributes.length === 0) blockers.push(`Product type "${type.name}" has no variant axes. Add up to three select attributes to it.`);
	else blockers.push(...productTypeProblems(type, attributes));
	for (const attribute of attributes) {
		if (attribute.values.length === 0) blockers.push(`Attribute "${attribute.name}" has no values yet.`);
	}
	const variants = await container.catalog.listVariants(productId);
	const stocks = await Promise.all(variants.map((variant) => container.inventory.get({ kind: "variant", id: variant.id })));
	return {
		product,
		type,
		axes: type ? attributes.map((attribute) => ({ attribute, values: axisValuesOf(type, attribute) })) : [],
		blockers,
		variants: variants.map((variant, index) => ({
			id: variant.id,
			title: variant.title,
			sku: variant.sku,
			price: variant.price,
			stock: stocks[index]?.onHand ?? null,
			isActive: variant.isActive,
			optionsKey: variant.optionsKey,
		})),
	};
};

export interface GenerateVariantsResult {
	created: number;
	skipped: number;
	createdIds: string[];
}

/** Ticked values per axis (attribute id → value ids) as the panel form posts them. */
export type VariantSelection = Readonly<Record<string, readonly string[]>>;

const invalid = (message: string): CommerceError => new CommerceError("invalidInput", message);

/**
 * Creates the missing combinations of the ticked values, one value per axis. A combination whose `options_key`
 * already exists is skipped, so running it twice creates nothing the second time. A product holds at most 50 variants
 * (the size of one relation read): a run that would go over refuses as a whole instead of creating part of them.
 * New variants are published, linked to the product and to their values in one write, and queued for Stripe sync.
 */
export const generateVariants = async (container: CommerceContainer, productId: string, selection: VariantSelection): Promise<GenerateVariantsResult> => {
	const model = await loadVariantGeneratorModel(container, productId);
	if (model.blockers.length > 0 || !model.type) throw invalid(model.blockers[0] ?? "Choose a product type first.");
	const { product, type } = model;

	const axes: AxisSelection[] = model.axes.map(({ attribute, values }) => {
		const offered = new Set(values.map((value) => value.id));
		const ticked = new Set(selection[attribute.id] ?? []);
		for (const id of ticked) {
			if (!offered.has(id)) throw invalid(`A selected value is not an allowed "${attribute.storefrontLabel}" for product type "${type.name}".`);
		}
		return { attributeId: attribute.id, valueIds: values.filter((value) => ticked.has(value.id)).map((value) => value.id) };
	});
	const empty = model.axes.filter((_, index) => axes[index]!.valueIds.length === 0).map(({ attribute }) => attribute.storefrontLabel);
	if (empty.length > 0) throw invalid(`Tick at least one value for ${empty.join(", ")}.`);

	const existingKeys = new Set(model.variants.map((variant) => variant.optionsKey).filter(Boolean));
	const plan = planGeneration(combinationsOf(axes), existingKeys);
	if (model.variants.length + plan.toCreate.length > MAX_VARIANTS_PER_PRODUCT) {
		throw new CommerceError(
			"catalogLimitExceeded",
			`That would make ${model.variants.length + plan.toCreate.length} variants; a product can have at most ${MAX_VARIANTS_PER_PRODUCT}. Tick fewer values.`,
			{ limit: MAX_VARIANTS_PER_PRODUCT },
		);
	}

	const slugs = container.options.collections;
	const valueById = new Map(model.axes.flatMap(({ attribute }) => attribute.values.map((value) => [value.id, value] as const)));
	const createdIds: string[] = [];
	for (const combo of plan.toCreate) {
		const values = combo.map((id) => valueById.get(id)!);
		try {
			const { id } = await container.relations.createWithReferences(
				slugs.variants,
				{
					status: "published",
					data: compact({
						[VARIANT_FIELD.title]: variantTitleOf(product.title, values.map((value) => value.label)),
						[VARIANT_FIELD.sku]: variantSkuOf(product.sku, product.slug || null, values.map((value) => value.code ?? value.label)) ?? undefined,
						[VARIANT_FIELD.optionsKey]: optionsKeyOf(combo),
						[VARIANT_FIELD.isActive]: true,
						[VARIANT_FIELD.trackInventory]: product.inventory.isTracked,
						[VARIANT_FIELD.allowBackorder]: product.inventory.allowsBackorder,
					}),
				},
				{ [VARIANT_FIELD.product]: [productId], [VARIANT_FIELD.optionValues]: combo },
			);
			createdIds.push(id);
		} catch (error) {
			const reason = error instanceof Error ? error.message : "unknown error";
			throw new CommerceError("conflict", `Created ${createdIds.length} of ${plan.toCreate.length} variants, then stopped: ${reason}`, { created: createdIds.length });
		}
	}

	if (createdIds.length > 0) await queueSync(container, productId);
	return { created: createdIds.length, skipped: plan.skippedKeys.length, createdIds };
};

/** Best effort: the plugin's own writes fire no content hooks, so new variants are queued for Stripe here (cron retries a failure). */
const queueSync = async (container: CommerceContainer, productId: string): Promise<void> => {
	try {
		await createCatalogSyncService(container, createEventPublisher(container)).syncEntity({ entity: "product", id: productId });
	} catch (error) {
		container.log.warn("Variant sync could not be queued; cron will retry", { productId, error: error instanceof Error ? error.message : "unknown" });
	}
};
