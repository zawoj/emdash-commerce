import { ATTRIBUTE_INPUT_TYPE, type Attribute, type ProductSpecs } from "../../core/product-type.js";
import type { SpecificationModel } from "../../services/catalog/specs.js";
import type { FormField, PanelBlock, PanelResponse } from "./blocks.js";

export const SPEC_FORM = { blockId: "specification", submitAction: "save_specification", fieldPrefix: "spec_" } as const;

export const specFieldId = (attributeId: string): string => `${SPEC_FORM.fieldPrefix}${attributeId}`;

const NONE = { label: "—", value: "" } as const;

const labelOf = (attribute: Attribute, isRequired: boolean): string => {
	const unit = attribute.unit ? ` (${attribute.unit})` : "";
	return `${attribute.storefrontLabel}${unit}${isRequired ? " *" : ""}`;
};

/** One control per specification attribute, shaped by its input type; null when it cannot be rendered (no values yet). */
const fieldFor = (attribute: Attribute, specs: ProductSpecs, isRequired: boolean): FormField | null => {
	const action_id = specFieldId(attribute.id);
	const label = labelOf(attribute, isRequired);
	const saved = specs[attribute.id];
	const options = attribute.values.map((value) => ({ label: value.label, value: value.id }));
	switch (attribute.inputType) {
		case ATTRIBUTE_INPUT_TYPE.select:
			return options.length === 0 ? null : { type: "select", action_id, label, options: [NONE, ...options], initial_value: typeof saved === "string" && options.some((option) => option.value === saved) ? saved : "" };
		case ATTRIBUTE_INPUT_TYPE.multiSelect:
			return options.length === 0 ? null : { type: "checkbox", action_id, label, options, initial_value: Array.isArray(saved) ? saved.filter((id) => options.some((option) => option.value === id)) : [] };
		case ATTRIBUTE_INPUT_TYPE.number:
			return { type: "number_input", action_id, label, ...(typeof saved === "number" ? { initial_value: saved } : {}) };
		case ATTRIBUTE_INPUT_TYPE.boolean:
			return { type: "toggle", action_id, label, initial_value: saved === true };
		default:
			return { type: "text_input", action_id, label, ...(typeof saved === "string" ? { initial_value: saved } : {}) };
	}
};

/** The Specification panel: the product type's specification attributes as one form; required ones are starred. */
export const renderSpecificationPanel = (model: SpecificationModel): PanelResponse => {
	if (!model.type) {
		return { blocks: [{ type: "banner", variant: "alert", title: "No product type", description: "Choose a product type for this product and save, then fill in its specification here." }] };
	}
	const required = new Set(model.type.requiredSpecIds);
	const blocks: PanelBlock[] = [];
	const fields: FormField[] = [];
	const skipped: string[] = [];
	for (const attribute of model.attributes) {
		const field = fieldFor(attribute, model.specs, required.has(attribute.id));
		if (field) fields.push(field);
		else skipped.push(attribute.name);
	}
	if (fields.length === 0) {
		blocks.push({ type: "context", text: `Product type "${model.type.name}" has no specification attributes yet.` });
		return { blocks };
	}
	blocks.push({ type: "context", text: `Specification of product type "${model.type.name}". Fields marked * are required to publish. The values are saved with the product's draft.` });
	if (skipped.length > 0) blocks.push({ type: "banner", variant: "alert", description: `No values yet for: ${skipped.join(", ")}.` });
	blocks.push({ type: "form", block_id: SPEC_FORM.blockId, fields, submit: { label: "Save specification", action_id: SPEC_FORM.submitAction } });
	return { blocks };
};
