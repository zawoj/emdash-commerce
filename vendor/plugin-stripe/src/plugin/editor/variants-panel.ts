import type { VariantGeneratorModel } from "../../services/catalog/variant-generator.js";
import { MAX_VARIANTS_PER_PRODUCT } from "../../core/catalog-rules.js";
import { contentLink, type PanelBlock, type PanelResponse } from "./blocks.js";

export const VARIANTS_FORM = { blockId: "variants_generate", submitAction: "generate_variants", pageAction: "variants_refresh", axisPrefix: "axis_" } as const;

/** The form field of one axis (`axis_<attributeId>`). */
export const axisFieldId = (attributeId: string): string => `${VARIANTS_FORM.axisPrefix}${attributeId}`;

const formatPrice = (amount: number | null): string => (amount === null ? "product price" : (amount / 100).toFixed(2));

/**
 * The Variants panel of a product: a checkbox group per axis of the product type (the values an editor may tick), a
 * Generate button and the variants that exist. `variantsCollection` is the slug the variant links point at.
 */
export const renderVariantsPanel = (model: VariantGeneratorModel, variantsCollection: string): PanelResponse => {
	const blocks: PanelBlock[] = [];
	if (model.blockers.length > 0) {
		blocks.push({ type: "banner", variant: "alert", title: "Variants cannot be generated yet", description: model.blockers.join(" ") });
	} else {
		blocks.push({
			type: "context",
			text: `Product type "${model.type?.name ?? ""}": one value per axis. Existing combinations are skipped; a product holds at most ${MAX_VARIANTS_PER_PRODUCT} variants (${model.variants.length} now).`,
		});
		blocks.push({
			type: "form",
			block_id: VARIANTS_FORM.blockId,
			fields: model.axes.map(({ attribute, values }) => ({
				type: "checkbox" as const,
				action_id: axisFieldId(attribute.id),
				label: attribute.storefrontLabel,
				options: values.map((value) => ({ label: value.label, value: value.id })),
				initial_value: values.map((value) => value.id),
			})),
			submit: { label: "Generate variants", action_id: VARIANTS_FORM.submitAction },
		});
	}
	blocks.push({
		type: "table",
		columns: [
			{ key: "title", label: "Variant", format: "element" },
			{ key: "sku", label: "SKU" },
			{ key: "price", label: "Price" },
			{ key: "stock", label: "Stock", format: "number" },
			{ key: "active", label: "Active", format: "badge" },
		],
		rows: model.variants.map((variant) => ({
			title: contentLink(variant.title || variant.id, variantsCollection, variant.id),
			sku: variant.sku ?? "",
			price: formatPrice(variant.price),
			stock: variant.stock ?? "",
			active: variant.isActive ? "active" : "inactive",
		})),
		page_action_id: VARIANTS_FORM.pageAction,
		empty_text: "No variants yet.",
	});
	return { blocks };
};
