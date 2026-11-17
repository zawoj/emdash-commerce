import type Stripe from "stripe";

import {
	PROVIDER_METADATA,
	type ProviderPriceSnapshot,
	type ProviderProductSnapshot,
} from "../../../ports/payment-provider.js";
import { currencyOf, idOf, metadataOf } from "./common.js";

export const entityKeyOf = (metadata: Stripe.Metadata | null | undefined): string | null =>
	metadataOf(metadata)[PROVIDER_METADATA.entity] ?? null;

/** `isDeleted` comes from a `*.deleted` event, whose object still reads `active: true`. */
export const toProductSnapshot = (product: Stripe.Product, options: { isDeleted?: boolean } = {}): ProviderProductSnapshot => ({
	providerId: product.id,
	name: product.name,
	isActive: options.isDeleted ? false : product.active,
	entityKey: entityKeyOf(product.metadata),
	updatedAt: product.updated,
});

export const toPriceSnapshot = (price: Stripe.Price, options: { isDeleted?: boolean } = {}): ProviderPriceSnapshot => ({
	providerId: price.id,
	providerProductId: idOf(price.product) ?? "",
	unitAmount: price.unit_amount,
	currency: currencyOf(price.currency, `price ${price.id}`),
	isActive: options.isDeleted ? false : price.active,
	entityKey: entityKeyOf(price.metadata),
});
