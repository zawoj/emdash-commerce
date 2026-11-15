import type { ProductCardView } from "@emdash-commerce/plugin-stripe/contracts";

import { NEW_PRODUCT_DAYS } from "./constants";

export interface PriceView {
	current: number;
	currency: string;
	isRange: boolean;
}

export const priceOfCard = (card: Pick<ProductCardView, "price">): PriceView => ({
	current: card.price.amount,
	currency: card.price.currency,
	isRange: card.price.isRange,
});

export const isNewProduct = (createdAt: string, now = Date.now()): boolean => {
	const created = Date.parse(createdAt);
	if (Number.isNaN(created)) return false;
	return now - created <= NEW_PRODUCT_DAYS * 86_400_000;
};
