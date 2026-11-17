import type { ProductGalleryProps, VariantPickerProps } from "@emdash-commerce/design-system";
import type { ProductDetailView } from "@emdash-commerce/plugin-stripe/contracts";
import { iconNames } from "@emdash-commerce/design-system/icon-names";

import type { Locale } from "../../../lib/i18n";
import { formatMoney, toDecimalString } from "../../../lib/money";
import { format } from "../../../lib/strings";
import type { CatalogCopy } from "../copy";
import { galleryOf } from "./gallery";
import { OPTION_FIELD_PREFIX, STOCK_STATUSES } from "./constants";
import { machineAmount } from "./card";
import { isPurchasable, stockLowLabel, stockOfAvailability } from "./stock";
import { bundleOf, deliveryRange, specsWithoutIncludes, type BundleView } from "./pdp";
import { buildVariantModel, findVariant, preselectedVariant, type VariantModel, type VariantRow } from "./variants";

export interface PriceState {
	label: string;
	value: number;
	note: string;
}

export interface AvailabilityState {
	label: string;
	isAvailable: boolean;
	isLow: boolean;
}

export interface BuyBoxState {
	surrogateId: number | null;
	priceId: string | null;
	price: PriceState;
	availability: AvailabilityState;
	sku: string | null;
	isPurchasable: boolean;
}

export interface ProductViewModel {
	title: string;
	brand: { name: string; href: string | null } | null;
	excerpt: string | null;
	breadcrumbs: { label: string; href?: string }[];
	gallery: ProductGalleryProps;
	picker: VariantPickerProps | null;
	priceFieldName: "priceId";
	preselectedSurrogateId: number | null;
	defaultState: BuyBoxState;
	variantStates: BuyBoxState[];
	hasVariants: boolean;
	isSoldOut: boolean;
	descriptionText: string | null;
	specRows: { label: string; value: string }[];
	promises: { icon: (typeof iconNames)[keyof typeof iconNames]; text: string; detail?: string }[];
	bundle: BundleView | null;
	subscriptionPriceId: string | null;
	subscriptionLabel: string | null;
	priceAmount: string;
}

const stockLabel = (
	stock: ReturnType<typeof stockOfAvailability>,
	copy: CatalogCopy,
	locale: Locale,
): string => {
	switch (stock.status) {
		case STOCK_STATUSES.inStock:
			return copy.stockIn;
		case STOCK_STATUSES.low:
			return stockLowLabel(locale, copy, stock.lowCount);
		case STOCK_STATUSES.backorder:
			return copy.stockBackorder;
		default:
			return copy.stockSoldOut;
	}
};

const stateOf = (
	row: VariantRow | null,
	detail: ProductDetailView,
	copy: CatalogCopy,
	locale: Locale,
	isRange: boolean,
): BuyBoxState => {
	const stock = row ? row.stock : stockOfAvailability(detail.availability);
	const amount = row?.priceAmount ?? detail.price.amount;
	const label = formatMoney(amount, locale, detail.price.currency);
	return {
		surrogateId: row?.surrogateId ?? null,
		priceId: row?.priceId ?? detail.price.priceId,
		isPurchasable: row ? row.stock.status !== STOCK_STATUSES.soldOut : isPurchasable(detail.availability),
		sku: row?.sku ?? detail.sku,
		price: {
			label: isRange && !row ? format(copy.fromPrice, { price: label }) : label,
			value: machineAmount(amount),
			note: copy.vatIncluded,
		},
		availability: {
			label: stockLabel(stock, copy, locale),
			isAvailable: stock.status !== STOCK_STATUSES.soldOut,
			isLow: stock.status === STOCK_STATUSES.low,
		},
	};
};

const buyStateForClient = (model: VariantModel) => ({
	axes: model.axes.map((axis) => axis.code),
	imageAxis: model.axes.find((axis) => axis.isImageAxis)?.code ?? null,
	variants: model.rows.map((row) => ({
		id: row.surrogateId,
		options: row.options,
		isPurchasable: row.stock.status !== STOCK_STATUSES.soldOut,
		priceId: row.priceId,
	})),
});

export const buildPicker = (
	copy: CatalogCopy,
	model: VariantModel,
	idBase: string,
	chosen: Record<string, string>,
): VariantPickerProps | null => {
	if (model.axes.length === 0) return null;
	return {
		id: idBase,
		soldOutLabel: copy.soldOutLabel,
		errorLabel: copy.variantError,
		axes: model.axes.map((axis) => ({
			name: `${OPTION_FIELD_PREFIX}${axis.code}`,
			label: axis.name,
			options: axis.values.map((value) => ({
				value: value.code,
				label: value.label,
				isChecked: chosen[axis.code] === value.code,
				isDisabled: value.isSoldOut,
			})),
			selectedLabel: axis.values.find((value) => value.code === chosen[axis.code])?.label,
		})),
	};
};

const initialChoice = (model: VariantModel, preselected: VariantRow | undefined): Record<string, string> => {
	if (preselected) return { ...preselected.options };
	const choice: Record<string, string> = {};
	for (const axis of model.axes) {
		const available = axis.values.find((value) => !value.isSoldOut);
		if (available) choice[axis.code] = available.code;
	}
	return choice;
};

export interface BuildProductViewInput {
	detail: ProductDetailView;
	locale: Locale;
	copy: CatalogCopy;
	shopHref: string;
	homeHref: string;
	/** The moment the delivery window counts from; defaults to now. */
	now?: Date;
}

export const buildProductView = ({ detail, locale, copy, shopHref, homeHref, now = new Date() }: BuildProductViewInput): ProductViewModel & { buyState: ReturnType<typeof buyStateForClient> } => {
	const model = buildVariantModel(detail);
	const preselected = preselectedVariant(model, detail.price.priceId);
	const chosen = initialChoice(model, preselected);
	const isRange = detail.price.isRange;
	const variantStates = model.rows.map((row) => stateOf(row, detail, copy, locale, false));
	const defaultState = stateOf(preselected ?? null, detail, copy, locale, isRange);
	const recurring = detail.extraPrices.find((price) => price.type === "recurring");
	const subscriptionLabel = recurring
		? formatMoney(recurring.amount, locale, recurring.currency)
		: null;

	return {
		title: detail.title,
		brand: detail.brand ? { name: detail.brand.name, href: null } : null,
		excerpt: detail.excerpt,
		breadcrumbs: [
			{ label: copy.home, href: homeHref },
			{ label: copy.shop, href: shopHref },
			{ label: detail.title },
		],
		gallery: {
			...galleryOf(detail, model),
			label: copy.galleryLabel,
			thumbnailsLabel: copy.thumbnailsLabel,
			thumbnailLabelTemplate: copy.thumbnailTemplate,
		},
		picker: buildPicker(copy, model, `pdp-${detail.slug}`, chosen),
		priceFieldName: "priceId",
		preselectedSurrogateId: preselected?.surrogateId ?? null,
		defaultState,
		variantStates,
		hasVariants: detail.hasVariants && model.rows.length > 1,
		isSoldOut: !defaultState.isPurchasable,
		descriptionText: portableTextToPlain(detail.description),
		specRows: specsWithoutIncludes(detail.specs),
		bundle: bundleOf(detail.specs, detail.description),
		promises: [
			// A sold-out product promises no delivery date.
			...(defaultState.isPurchasable
				? [
						{
							icon: iconNames.truck,
							text: copy.promiseDeliveryTitle,
							detail: format(copy.promiseDeliveryDetail, { range: deliveryRange(now, locale) }),
						},
					]
				: []),
			{ icon: iconNames.rotateCcw, text: copy.promiseReturns, detail: copy.promiseReturnsDetail },
			{ icon: iconNames.shieldCheck, text: copy.promisePayments, detail: copy.promisePaymentsDetail },
		],
		subscriptionPriceId: recurring?.priceId ?? null,
		subscriptionLabel,
		priceAmount: toDecimalString(detail.price.amount),
		buyState: buyStateForClient(model),
	};
};

export const pickerChosen = (model: VariantModel, variant: VariantRow | undefined): Record<string, string> =>
	variant ? { ...variant.options } : initialChoice(model, undefined);

export { findVariant, buildVariantModel };

const portableTextToPlain = (blocks: ProductDetailView["description"]): string | null => {
	if (!blocks || blocks.length === 0) return null;
	const chunks: string[] = [];
	for (const block of blocks) {
		if (typeof block !== "object" || block === null) continue;
		const children = (block as { children?: { text?: string }[] }).children;
		if (Array.isArray(children)) {
			for (const child of children) {
				if (typeof child.text === "string" && child.text.trim()) chunks.push(child.text.trim());
			}
		}
	}
	return chunks.length > 0 ? chunks.join("\n\n") : null;
};
