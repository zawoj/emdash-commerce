import { isSwatchColour, type Attribute, type ProductSpecs, type ProductType, type SpecValue } from "./product-type.js";

/**
 * Pure rules of the catalog model: option keys, derived titles and SKUs, the combinations a generator creates and
 * the checks a product type and a specification impose. No I/O, so the hook, the publish guard, the generator and
 * the editor panels share one definition of "valid".
 */

/** Variants per product; the same number a relation read returns in one page. */
export const MAX_VARIANTS_PER_PRODUCT = 50;
export const MAX_AXES_PER_TYPE = 3;
const KEY_SEPARATOR = "|";

/** Identical combinations share a key whatever order their values were linked in. */
export const optionsKeyOf = (valueIds: readonly string[]): string => [...valueIds].sort().join(KEY_SEPARATOR);

/** `Shirt — M / Black`; just the product title when no value label is known. */
export const variantTitleOf = (productTitle: string, valueLabels: readonly string[]): string =>
	valueLabels.length > 0 ? `${productTitle} — ${valueLabels.join(" / ")}` : productTitle;

const skuPart = (value: string): string =>
	value
		.trim()
		.toUpperCase()
		.replace(/[^A-Z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");

/** `SHIRT-01-M-BLK` from the product SKU (or slug) and the value codes (or labels); null when nothing to build from. */
export const variantSkuOf = (productSku: string | null, productSlug: string | null, valueTokens: readonly string[]): string | null => {
	const base = skuPart(productSku ?? productSlug ?? "");
	const parts = valueTokens.map(skuPart).filter(Boolean);
	if (!base || parts.length === 0) return null;
	return [base, ...parts].join("-");
};

export interface AxisSelection {
	attributeId: string;
	/** Ticked value ids, in the attribute's own value order. */
	valueIds: string[];
}

/** The cartesian product of the ticked values, one value per axis, in axis order. Empty when any axis has none. */
export const combinationsOf = (axes: readonly AxisSelection[]): string[][] => {
	if (axes.length === 0 || axes.some((axis) => axis.valueIds.length === 0)) return [];
	return axes.reduce<string[][]>((combos, axis) => combos.flatMap((combo) => axis.valueIds.map((valueId) => [...combo, valueId])), [[]]);
};

/**
 * The values an axis offers for a product type: its allowed values when the type lists any for that axis, else all
 * of the attribute's values.
 */
export const axisValuesOf = (type: Pick<ProductType, "allowedValueIds">, attribute: Attribute): Attribute["values"] => {
	const allowed = new Set(type.allowedValueIds);
	const listed = attribute.values.filter((value) => allowed.has(value.id));
	return listed.length > 0 ? listed : attribute.values;
};

export interface GeneratedVariantPlan {
	toCreate: string[][];
	skippedKeys: string[];
}

/** Splits the combinations into those still missing and those whose `options_key` already exists. */
export const planGeneration = (combos: readonly string[][], existingKeys: ReadonlySet<string>): GeneratedVariantPlan => {
	const toCreate: string[][] = [];
	const skippedKeys: string[] = [];
	const seen = new Set<string>();
	for (const combo of combos) {
		const key = optionsKeyOf(combo);
		if (existingKeys.has(key) || seen.has(key)) {
			skippedKeys.push(key);
			continue;
		}
		seen.add(key);
		toCreate.push(combo);
	}
	return { toCreate, skippedKeys };
};

// --- Checks ---------------------------------------------------------------------------------------------------

/** Why a product type cannot drive variants (empty = fine). `axes` are the attributes the type lists, in order. */
export const productTypeProblems = (type: Pick<ProductType, "name" | "variantAxisIds" | "specAttributeIds" | "requiredSpecIds">, axes: readonly Attribute[]): string[] => {
	const problems: string[] = [];
	if (type.variantAxisIds.length > MAX_AXES_PER_TYPE) problems.push(`Product type "${type.name}" has ${type.variantAxisIds.length} variant axes; at most ${MAX_AXES_PER_TYPE} are allowed.`);
	for (const axis of axes) {
		if (axis.inputType !== "select") problems.push(`Variant axis "${axis.name}" must be a select attribute (it is ${axis.inputType}).`);
	}
	const specs = new Set(type.specAttributeIds);
	for (const id of type.requiredSpecIds) {
		if (!specs.has(id)) problems.push(`Product type "${type.name}" requires a specification that is not one of its specification attributes.`);
	}
	return problems;
};

/** Why a variant's values do not fit the type's axes: one value per axis, each from the axis' offered values. */
export const variantValueProblems = (type: ProductType, axes: readonly Attribute[], valueIds: readonly string[]): string[] => {
	const problems: string[] = [];
	const chosen = new Set(valueIds);
	if (chosen.size !== valueIds.length) problems.push("A value is selected more than once.");
	let matched = 0;
	for (const axis of axes) {
		const offered = new Set(axisValuesOf(type, axis).map((value) => value.id));
		const own = valueIds.filter((id) => axis.values.some((value) => value.id === id));
		if (own.length === 0) problems.push(`Pick a value for "${axis.storefrontLabel}".`);
		else if (own.length > 1) problems.push(`Pick one value for "${axis.storefrontLabel}", not ${own.length}.`);
		else if (!offered.has(own[0]!)) problems.push(`"${axis.values.find((value) => value.id === own[0])?.label ?? own[0]}" is not an allowed ${axis.storefrontLabel} for this product type.`);
		matched += own.length;
	}
	if (matched < valueIds.length) problems.push("A selected value does not belong to any axis of the product type.");
	return problems;
};

export const swatchProblem = (swatch: unknown): string | null => {
	if (swatch === undefined || swatch === null || swatch === "") return null;
	if (typeof swatch !== "string" || !isSwatchColour(swatch)) return `Swatch colour "${String(swatch)}" must be #rgb or #rrggbb.`;
	return null;
};

const isFilled = (value: SpecValue | undefined): boolean => {
	if (value === undefined || value === null) return false;
	if (typeof value === "string") return value.trim().length > 0;
	if (Array.isArray(value)) return value.length > 0;
	return true;
};

/** Required specification attributes with no saved value, by attribute name. */
export const missingRequiredSpecs = (type: Pick<ProductType, "requiredSpecIds">, specs: ProductSpecs, nameOf: (attributeId: string) => string): string[] =>
	type.requiredSpecIds.filter((id) => !isFilled(specs[id])).map(nameOf);

/** Keeps only the rows of attributes the type still specifies (a type change re-shapes the snapshot). */
export const reshapeSpecs = (specs: ProductSpecs, type: Pick<ProductType, "specAttributeIds"> | null): ProductSpecs => {
	const keep = new Set(type?.specAttributeIds ?? []);
	return Object.fromEntries(Object.entries(specs).filter(([attributeId]) => keep.has(attributeId)));
};
