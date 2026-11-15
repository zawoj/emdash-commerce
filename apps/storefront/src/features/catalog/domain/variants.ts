import type { ProductDetailView } from "@emdash-commerce/plugin-stripe/contracts";

import { IMAGE_AXIS_PATTERN, SIZE_ATTRIBUTE_PATTERN } from "./constants";
import { priceOfCard } from "./pricing";
import { isPurchasable, stockOfAvailability } from "./stock";

export interface AxisValue {
	id: string;
	code: string;
	label: string;
	isSoldOut: boolean;
}

export interface Axis {
	attributeId: string;
	code: string;
	name: string;
	presentation: "buttons" | "swatch" | "dropdown";
	values: AxisValue[];
	isSize: boolean;
	isImageAxis: boolean;
}

/** Row keyed by a stable numeric id for the design system's variant scripts. */
export interface VariantRow {
	surrogateId: number;
	variantId: string;
	priceId: string;
	sku: string | null;
	options: Record<string, string>;
	stock: ReturnType<typeof stockOfAvailability>;
	priceAmount: number;
	currency: string;
	imageUrls: string[];
	isActive: boolean;
}

export interface VariantModel {
	axes: Axis[];
	rows: VariantRow[];
}

export const buildVariantModel = (detail: ProductDetailView): VariantModel => {
	const axes: Axis[] = detail.axes.map((axis) => ({
		attributeId: axis.attributeId,
		code: axis.code,
		name: axis.label,
		presentation: axis.presentation,
		isSize: SIZE_ATTRIBUTE_PATTERN.test(axis.code),
		isImageAxis: axis.isImageAxis || IMAGE_AXIS_PATTERN.test(axis.code),
		values: axis.values.map((value) => {
			const hasBuyable = detail.variants.some(
				(variant) =>
					variant.isActive &&
					variant.options[axis.code] === value.code &&
					isPurchasable(variant.availability),
			);
			return {
				id: value.id,
				code: value.code,
				label: value.label,
				isSoldOut: !hasBuyable,
			};
		}),
	}));

	const rows: VariantRow[] = detail.variants
		.filter((variant) => variant.isActive)
		.map((variant, index) => ({
			surrogateId: index + 1,
			variantId: variant.id,
			priceId: variant.price.priceId,
			sku: variant.sku,
			options: variant.options,
			stock: stockOfAvailability(variant.availability),
			priceAmount: variant.price.amount,
			currency: variant.price.currency,
			imageUrls: variant.imageUrls,
			isActive: variant.isActive,
		}));

	return { axes, rows };
};

export const findVariant = (
	model: VariantModel,
	chosen: Readonly<Record<string, string>>,
): VariantRow | undefined =>
	model.rows.find((row) => model.axes.every((axis) => row.options[axis.code] === chosen[axis.code]));

export const preselectedVariant = (
	model: VariantModel,
	priceId: string | null,
): VariantRow | undefined => {
	if (priceId) {
		const byPrice = model.rows.find((row) => row.priceId === priceId);
		if (byPrice) return byPrice;
	}
	return model.rows.length === 1 ? model.rows[0] : undefined;
};

export const defaultProductPrice = (detail: ProductDetailView) => priceOfCard(detail);
