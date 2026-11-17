import { PRODUCT_FIELD } from "../../adapters/emdash/schema/field-names.js";
import { reshapeSpecs } from "../../core/catalog-rules.js";
import type { Product } from "../../core/catalog.js";
import { CommerceError } from "../../core/errors.js";
import { ATTRIBUTE_INPUT_TYPE, type Attribute, type ProductSpecs, type ProductType, type SpecValue } from "../../core/product-type.js";
import { requireContent, type CommerceContainer } from "../../plugin/container.js";
import { readEditorData, requireEditorProduct, specsOfData } from "./editor-read.js";

export interface SpecificationModel {
	product: Product;
	type: ProductType | null;
	/** The type's specification attributes in order, each with its values. */
	attributes: Attribute[];
	/** Saved values, already re-shaped to the type (rows of attributes it no longer lists are gone). */
	specs: ProductSpecs;
}

export const loadSpecificationModel = async (container: CommerceContainer, productId: string): Promise<SpecificationModel> => {
	const product = await requireEditorProduct(container, productId);
	const type = product.typeId ? await container.catalog.getProductType(product.typeId) : null;
	const loaded = type ? await Promise.all(type.specAttributeIds.map((id) => container.catalog.getAttribute(id))) : [];
	const editor = await readEditorData(container, container.options.collections.products, productId);
	return {
		product,
		type,
		attributes: loaded.filter((attribute): attribute is Attribute => attribute !== null),
		specs: reshapeSpecs(specsOfData(editor?.data ?? {}), type),
	};
};

const invalid = (message: string): CommerceError => new CommerceError("invalidInput", message);

/** One submitted control value coerced to what the attribute stores, or `undefined` for "left empty". */
export const coerceSpecValue = (attribute: Attribute, raw: unknown): SpecValue | undefined => {
	const valueIds = new Set(attribute.values.map((value) => value.id));
	switch (attribute.inputType) {
		case ATTRIBUTE_INPUT_TYPE.select: {
			if (raw === undefined || raw === null || raw === "") return undefined;
			if (typeof raw !== "string" || !valueIds.has(raw)) throw invalid(`"${String(raw)}" is not a value of "${attribute.name}".`);
			return raw;
		}
		case ATTRIBUTE_INPUT_TYPE.multiSelect: {
			const list = Array.isArray(raw) ? raw : [];
			for (const entry of list) {
				if (typeof entry !== "string" || !valueIds.has(entry)) throw invalid(`"${String(entry)}" is not a value of "${attribute.name}".`);
			}
			return list.length > 0 ? (list as string[]) : undefined;
		}
		case ATTRIBUTE_INPUT_TYPE.number: {
			if (raw === undefined || raw === null || raw === "") return undefined;
			const value = typeof raw === "number" ? raw : Number(raw);
			if (!Number.isFinite(value)) throw invalid(`"${attribute.name}" must be a number.`);
			return value;
		}
		case ATTRIBUTE_INPUT_TYPE.boolean:
			return typeof raw === "boolean" ? raw : undefined;
		default: {
			if (typeof raw !== "string" || raw.trim().length === 0) return undefined;
			return raw.trim().slice(0, 500);
		}
	}
};

/**
 * Saves the Specification panel: one value per specification attribute of the product's type, keyed by attribute id.
 * Attributes the type does not list are dropped, so changing the type re-shapes the snapshot. The write goes through
 * `ctx.content.update` (no hooks); on a collection with revisions it lands in the draft and is published with it.
 */
export const saveSpecification = async (container: CommerceContainer, productId: string, submitted: Readonly<Record<string, unknown>>): Promise<ProductSpecs> => {
	const model = await loadSpecificationModel(container, productId);
	if (!model.type) throw invalid("Choose a product type for this product and save before filling the specification.");
	const specs: ProductSpecs = {};
	for (const attribute of model.attributes) {
		const value = coerceSpecValue(attribute, submitted[attribute.id]);
		if (value !== undefined) specs[attribute.id] = value;
	}
	await requireContent(container).update(container.options.collections.products, productId, { [PRODUCT_FIELD.specs]: specs });
	return specs;
};
