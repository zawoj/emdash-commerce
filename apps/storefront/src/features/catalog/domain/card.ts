import type { ProductCardContent } from "@emdash-commerce/design-system";
import type { ProductCardView } from "@emdash-commerce/plugin-stripe/contracts";

import type { Locale } from "../../../lib/i18n";
import { imageFromView } from "../../../lib/media";
import { formatMoney, toDecimalString } from "../../../lib/money";
import { format } from "../../../lib/strings";
import type { CatalogCopy } from "../copy";
import { CARD_IMAGE_SIZES, EAGER_CARDS, STOCK_STATUSES } from "./constants";
import { isNewProduct, priceOfCard } from "./pricing";
import { stockLowLabel, stockOfAvailability } from "./stock";

export interface CardContext {
	locale: Locale;
	copy: CatalogCopy;
	hrefOf: (slug: string) => string;
	now?: number;
}

export const machineAmount = (minor: number): number => Number(toDecimalString(minor));

export const cardPriority = (index: number): { isEager: boolean; isLead: boolean } => ({
	isEager: index < EAGER_CARDS,
	isLead: index < EAGER_CARDS,
});

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
		case STOCK_STATUSES.soldOut:
			return copy.stockSoldOut;
	}
};

export const toCard = (item: ProductCardView, context: CardContext): ProductCardContent => {
	const { locale, copy } = context;
	const price = priceOfCard(item);
	const stock = stockOfAvailability(item.availability);
	const priceLabel = formatMoney(price.current, locale, price.currency);
	const badges = [isNewProduct(item.createdAt, context.now) ? copy.badgeNew : null].filter(
		(badge): badge is string => badge !== null,
	);
	const sizes =
		item.sizes.length > 0
			? item.sizes.map((size) => ({ label: size.label, isAvailable: size.isAvailable }))
			: undefined;
	return {
		title: item.title,
		href: context.hrefOf(item.slug),
		image: imageFromView(item.images[0], { sizes: CARD_IMAGE_SIZES }),
		hoverImage: item.images[1]
			? imageFromView({ url: item.images[1].url, alt: item.images[1].alt || "" }, { sizes: CARD_IMAGE_SIZES })
			: undefined,
		sizes,
		sizesLabel: sizes ? copy.sizesLabel : undefined,
		price: {
			label: price.isRange ? format(copy.fromPrice, { price: priceLabel }) : priceLabel,
			value: machineAmount(price.current),
		},
		badges: badges.length > 0 ? badges : undefined,
		availability: {
			label: stockLabel(stock, copy, locale),
			isAvailable: stock.status !== STOCK_STATUSES.soldOut,
			isLow: stock.status === STOCK_STATUSES.low,
		},
	};
};
