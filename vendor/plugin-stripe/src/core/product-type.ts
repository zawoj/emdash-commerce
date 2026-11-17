/**
 * Product-model vocabulary: attributes, their values, product types (variant axes + specification attributes),
 * brands and categories. EmDash content is the source of truth; these are the shapes the plugin reads.
 *
 * - An `Attribute` is a named property ("Colour", "Size", "Material"). Its ordered `AttributeValue`s are the
 *   choices ("Black", "M"); a value may carry a swatch colour.
 * - A `ProductType` picks up to three `variantAxes` (select attributes whose values make up a variant) and a
 *   set of `specAttributes` (shown as the specification table, some of them `requiredSpecs`).
 */

export const ATTRIBUTE_INPUT_TYPE = {
	select: "select",
	multiSelect: "multi_select",
	text: "text",
	number: "number",
	boolean: "boolean",
} as const;
export type AttributeInputType = (typeof ATTRIBUTE_INPUT_TYPE)[keyof typeof ATTRIBUTE_INPUT_TYPE];

export const ATTRIBUTE_PRESENTATION = {
	buttons: "buttons",
	swatch: "swatch",
	dropdown: "dropdown",
} as const;
export type AttributePresentation = (typeof ATTRIBUTE_PRESENTATION)[keyof typeof ATTRIBUTE_PRESENTATION];

export interface AttributeValue {
	id: string;
	attributeId: string;
	label: string;
	code: string | null;
	/** `#rgb` / `#rrggbb` or null. */
	swatch: string | null;
}

export interface Attribute {
	id: string;
	name: string;
	/** What the storefront shows; falls back to `name`. */
	storefrontLabel: string;
	code: string | null;
	inputType: AttributeInputType;
	presentation: AttributePresentation;
	unit: string | null;
	isFilterable: boolean;
	/** Ordered; only meaningful for select / multi-select attributes. */
	values: AttributeValue[];
}

export interface ProductType {
	id: string;
	name: string;
	code: string | null;
	/** Ordered attribute ids, at most three, select attributes only. */
	variantAxisIds: string[];
	/** Allowed value ids across the axes; an axis with none of its values listed allows all of them. */
	allowedValueIds: string[];
	specAttributeIds: string[];
	/** A subset of `specAttributeIds` a product must fill before it can be published. */
	requiredSpecIds: string[];
}

export interface Brand {
	id: string;
	slug: string;
	name: string;
	imageUrls: string[];
	website: string | null;
	intro: string | null;
}

export interface Category {
	id: string;
	slug: string;
	name: string;
	imageUrls: string[];
	intro: string | null;
	parentId: string | null;
}

/** A saved specification value: a value id (select), value ids (multi-select), text, number or boolean. */
export type SpecValue = string | string[] | number | boolean;
export type ProductSpecs = Record<string, SpecValue>;

const SWATCH_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
export const isSwatchColour = (value: string): boolean => SWATCH_PATTERN.test(value);
