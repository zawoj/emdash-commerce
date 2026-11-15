import type { LookProductChoice, LookPrice, LookVariant } from "@emdash-commerce/design-system";
import type { ProductDetailView } from "@emdash-commerce/plugin-stripe/contracts";

import type { Locale } from "../../../lib/i18n";
import { imageFromView } from "../../../lib/media";
import { formatMoney } from "../../../lib/money";
import { format } from "../../../lib/strings";
import type { CatalogCopy } from "../copy";
import { machineAmount } from "./card";
import { STOCK_STATUSES } from "./constants";
import { isPurchasable } from "./stock";
import { buildPicker, pickerChosen } from "./product-view";
import { buildVariantModel, findVariant, preselectedVariant } from "./variants";

export interface LookChoiceBundle {
	choice: LookProductChoice;
	/** Maps design-system surrogate variant id → Stripe price id. */
	priceIdBySurrogate: Record<number, string>;
	productId: string;
}

const lookPrice = (amount: number, currency: string, locale: Locale, copy: CatalogCopy, isRange = false): LookPrice => {
	const label = formatMoney(amount, locale, currency);
	return {
		label: isRange ? format(copy.fromPrice, { price: label }) : label,
		value: machineAmount(amount),
		minor: amount,
		note: copy.vatIncluded,
	};
};

export const buildLookChoice = (
	detail: ProductDetailView,
	locale: Locale,
	copy: CatalogCopy,
	href: string,
	idBase: string,
	numericProductId: number,
	preferredColourCode?: string,
): LookChoiceBundle | null => {
	const image = imageFromView(detail.images[0], { sizes: "(min-width: 768px) 420px, 96px" });
	if (!image) return null;

	const model = buildVariantModel(detail);
	const priceId = detail.price.priceId;
	if (model.rows.length === 0 && priceId) {
		const isPurchasableProduct = isPurchasable(detail.availability);
		const variantId = 1;
		const amount = detail.price.amount;
		const prices: LookPrice[] = [lookPrice(amount, detail.price.currency, locale, copy)];
		const priceIdBySurrogate: Record<number, string> = { [variantId]: priceId };
		const choice: LookProductChoice = {
			id: numericProductId,
			title: detail.title,
			href,
			image,
			picker: null,
			defaultPrice: lookPrice(amount, detail.price.currency, locale, copy),
			prices,
			axes: [],
			imageAxis: null,
			variants: [{ id: variantId, options: {}, isPurchasable: isPurchasableProduct, price: 0 }],
		};
		return { choice, priceIdBySurrogate, productId: detail.id };
	}

	if (model.rows.length === 0) return null;

	const preselected = preselectedVariant(model, detail.price.priceId);
	const imageAxis = model.axes.find((axis) => axis.isImageAxis);
	let chosen = pickerChosen(model, preselected);
	if (preferredColourCode && imageAxis) {
		chosen = { ...chosen, [imageAxis.code]: preferredColourCode };
		if (!findVariant(model, chosen)) {
			const fallback = model.rows.find(
				(row) => row.options[imageAxis.code] === preferredColourCode && row.stock.status !== STOCK_STATUSES.soldOut,
			);
			if (fallback) chosen = { ...fallback.options };
		}
	}

	const prices: LookPrice[] = [];
	const priceIndex = new Map<string, number>();
	const priceIdBySurrogate: Record<number, string> = {};
	const variants: LookVariant[] = model.rows.map((row) => {
		priceIdBySurrogate[row.surrogateId] = row.priceId;
		const key = String(row.priceAmount);
		let index = priceIndex.get(key);
		if (index === undefined) {
			index = prices.push(lookPrice(row.priceAmount, row.currency, locale, copy)) - 1;
			priceIndex.set(key, index);
		}
		return {
			id: row.surrogateId,
			options: row.options,
			isPurchasable: row.stock.status !== STOCK_STATUSES.soldOut,
			price: index,
		};
	});

	const choice: LookProductChoice = {
		id: numericProductId,
		title: detail.title,
		href,
		image,
		picker: buildPicker(copy, model, idBase, chosen),
		defaultPrice: lookPrice(detail.price.amount, detail.price.currency, locale, copy, detail.price.isRange),
		prices,
		axes: model.axes.map((axis) => axis.code),
		imageAxis: imageAxis?.code ?? null,
		variants,
	};

	return { choice, priceIdBySurrogate, productId: detail.id };
};
