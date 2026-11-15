import type { ProductGalleryProps, VariantPickerProps } from "@emdash-commerce/design-system";
import type { ProductDetailView } from "@emdash-commerce/plugin-stripe/contracts";
import { iconNames } from "@emdash-commerce/design-system";

import type { Locale } from "../../../lib/i18n";
import { imageFromUrl, imageFromView } from "../../../lib/media";
import { formatMoney, toDecimalString } from "../../../lib/money";
import { format } from "../../../lib/strings";
import type { CatalogCopy } from "../copy";
import { OPTION_FIELD_PREFIX, STOCK_STATUSES } from "./constants";
import { machineAmount } from "./card";
import { isPurchasable, stockOfAvailability } from "./stock";
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
	promises: { icon: (typeof iconNames)[keyof typeof iconNames]; text: string }[];
	subscriptionPriceId: string | null;
	subscriptionLabel: string | null;
	priceAmount: string;
}

const stockLabel = (
	stock: ReturnType<typeof stockOfAvailability>,
	copy: CatalogCopy,
): string => {
	switch (stock.status) {
		case STOCK_STATUSES.inStock:
			return copy.stockIn;
		case STOCK_STATUSES.low:
			return format(copy.stockLow, { count: stock.lowCount ?? 1 });
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
			label: stockLabel(stock, copy),
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

const galleryOf = (detail: ProductDetailView, model: VariantModel, chosenColour: string | undefined): ProductGalleryProps => {
	const groups = new Map<string | null, { src: string; alt: string }[]>();
	for (const image of detail.images) {
		const list = groups.get(null) ?? [];
		list.push({ src: image.url, alt: image.alt });
		groups.set(null, list);
	}
	const imageAxis = model.axes.find((axis) => axis.isImageAxis);
	if (imageAxis) {
		for (const row of model.rows) {
			if (row.imageUrls.length === 0) continue;
			const group = row.options[imageAxis.code];
			const list = groups.get(group) ?? [];
			for (const url of row.imageUrls) {
				list.push({ src: url, alt: detail.title });
			}
			groups.set(group, list);
		}
	}
	const photos =
		chosenColour && groups.has(chosenColour)
			? groups.get(chosenColour)!
			: (groups.get(null) ?? detail.images.map((image) => ({ src: image.url, alt: image.alt })));
	const images = photos
		.map((photo, index) => {
			const image = imageFromUrl(photo.src, photo.alt, {
				sizes: "(min-width: 1024px) 50vw, 100vw",
				isEager: index === 0,
				isLead: index === 0,
			});
			return image ? { image, group: chosenColour ?? undefined } : null;
		})
		.filter((entry): entry is NonNullable<typeof entry> => entry !== null);
	return {
		id: "pdp-gallery",
		images,
		label: "",
		thumbnailsLabel: "",
		thumbnailLabelTemplate: "",
		isEager: true,
	};
};

export interface BuildProductViewInput {
	detail: ProductDetailView;
	locale: Locale;
	copy: CatalogCopy;
	shopHref: string;
	homeHref: string;
}

export const buildProductView = ({ detail, locale, copy, shopHref, homeHref }: BuildProductViewInput): ProductViewModel & { buyState: ReturnType<typeof buyStateForClient> } => {
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
			...galleryOf(detail, model, imageAxisChosen(model, chosen)),
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
		specRows: detail.specs,
		promises: [
			{ icon: iconNames.rotateCcw, text: copy.promiseReturns },
			{ icon: iconNames.shieldCheck, text: copy.promiseWarranty },
			{ icon: iconNames.creditCard, text: copy.promisePayments },
		],
		subscriptionPriceId: recurring?.priceId ?? null,
		subscriptionLabel,
		priceAmount: toDecimalString(detail.price.amount),
		buyState: buyStateForClient(model),
	};
};

const imageAxisChosen = (model: VariantModel, chosen: Record<string, string>): string | undefined => {
	const axis = model.axes.find((a) => a.isImageAxis);
	return axis ? chosen[axis.code] : undefined;
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
