import { axisValuesOf } from "../../core/catalog-rules.js";
import type { Attribute, AttributeValue, ProductType } from "../../core/product-type.js";
import type { CatalogRepository } from "../../ports/repositories.js";

/** One variant axis of a product type: its attribute and the values the type offers for it. */
export interface AxisModel {
	attribute: Attribute;
	/** Ordered; the type's allowed values for this axis, or all of the attribute's values when it lists none. */
	offered: AttributeValue[];
}

export interface ProductAxes {
	type: ProductType | null;
	/** In the type's axis order; an axis whose attribute no longer exists is skipped. */
	axes: AxisModel[];
}

export const NO_AXES: ProductAxes = { type: null, axes: [] };

/** The axes of a product type (none for a product without a type). Attributes are read once each. */
export const loadAxes = async (catalog: Pick<CatalogRepository, "getProductType" | "getAttribute">, typeId: string | null): Promise<ProductAxes> => {
	const type = typeId ? await catalog.getProductType(typeId) : null;
	if (!type) return NO_AXES;
	const attributes = await Promise.all(type.variantAxisIds.map((id) => catalog.getAttribute(id)));
	const axes = attributes.flatMap((attribute) => (attribute ? [{ attribute, offered: axisValuesOf(type, attribute) }] : []));
	return { type, axes };
};

export interface ResolvedOption {
	axis: Attribute;
	value: AttributeValue;
}

/** The value a variant holds per axis, in axis order; an axis the variant has no value for is skipped. */
export const resolveOptions = (axes: readonly AxisModel[], valueIds: readonly string[]): ResolvedOption[] => {
	const chosen = new Set(valueIds);
	return axes.flatMap(({ attribute }) => {
		const value = attribute.values.find((candidate) => chosen.has(candidate.id));
		return value ? [{ axis: attribute, value }] : [];
	});
};

/** "Size: M, Colour: Black" (storefront label of the attribute + value label, in axis order); null without options. */
export const optionsTextOf = (options: readonly ResolvedOption[]): string | null => {
	const parts = options.filter(({ axis, value }) => axis.storefrontLabel && value.label).map(({ axis, value }) => `${axis.storefrontLabel}: ${value.label}`);
	return parts.length > 0 ? parts.join(", ") : null;
};

/** The key an axis has in a variant's `options` record: its code, else its name slugified. */
export const axisCodeOf = (attribute: Attribute): string => attribute.code ?? slug(attribute.name);
export const valueCodeOf = (value: AttributeValue): string => value.code ?? slug(value.label);

const slug = (text: string): string =>
	text
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
