import type Stripe from "stripe";

import {
	PROVIDER_METADATA,
	type CatalogProvider,
	type ProviderPriceInput,
	type ProviderPriceSnapshot,
	type ProviderProductInput,
	type ProviderProductSnapshot,
} from "../../ports/payment-provider.js";
import { PLUGIN_METADATA_VALUE } from "./constants.js";
import { callStripe, retrieveStripe } from "./errors.js";
import { buildMetadata } from "./metadata.js";
import { toPriceSnapshot, toProductSnapshot } from "./mappers/catalog-snapshots.js";

/** Stripe shows at most 8 images per product. */
const MAX_PRODUCT_IMAGES = 8;

const LOCAL_HOST_PATTERN = /^(localhost|.*\.localhost|.*\.local|0\.0\.0\.0|127\..*|\[::1\])$/i;

/** Stripe fetches product images itself: only public absolute https URLs are usable (not localhost or relative paths). */
export const publicImageUrls = (urls: readonly string[]): string[] => {
	const result: string[] = [];
	for (const candidate of urls) {
		try {
			const url = new URL(candidate);
			if (url.protocol === "https:" && !LOCAL_HOST_PATTERN.test(url.hostname)) result.push(url.toString());
		} catch {
			// relative or malformed: dropped
		}
	}
	return result.slice(0, MAX_PRODUCT_IMAGES);
};

const productMetadata = (input: ProviderProductInput): Record<string, string> =>
	buildMetadata(
		{ [PROVIDER_METADATA.entity]: input.entityKey, [PROVIDER_METADATA.pluginId]: PLUGIN_METADATA_VALUE },
		input.extraMetadata,
		{ prefixExtras: false },
	);

export const buildProductCreateParams = (input: ProviderProductInput): Stripe.ProductCreateParams => {
	const images = publicImageUrls(input.imageUrls);
	return {
		name: input.name,
		active: input.isActive,
		metadata: productMetadata(input),
		...(input.description ? { description: input.description } : {}),
		...(images.length > 0 ? { images } : {}),
		...(input.taxCode ? { tax_code: input.taxCode } : {}),
	};
};

/** Update sends `null` (Stripe: empty string) for what is unset, so a cleared description or image really clears. */
export const buildProductUpdateParams = (input: ProviderProductInput): Stripe.ProductUpdateParams => {
	const images = publicImageUrls(input.imageUrls);
	return {
		name: input.name,
		active: input.isActive,
		metadata: productMetadata(input),
		description: input.description || null,
		images: images.length > 0 ? images : null,
		tax_code: input.taxCode || null,
	};
};

export const buildPriceCreateParams = (input: ProviderPriceInput): Stripe.PriceCreateParams => ({
	product: input.providerProductId,
	unit_amount: input.unitAmount,
	currency: input.currency,
	tax_behavior: input.taxBehavior,
	metadata: buildMetadata({ [PROVIDER_METADATA.entity]: input.entityKey, [PROVIDER_METADATA.pluginId]: PLUGIN_METADATA_VALUE }),
	...(input.nickname ? { nickname: input.nickname } : {}),
	// The lookup key may still sit on the previous price of this entity; transfer moves it instead of failing.
	...(input.lookupKey ? { lookup_key: input.lookupKey, transfer_lookup_key: true } : {}),
	...(input.recurring ? { recurring: { interval: input.recurring.interval, interval_count: input.recurring.intervalCount } } : {}),
});

type PricePatch = Parameters<CatalogProvider["updatePrice"]>[1];

/** Only these fields are mutable on a Price (Prices.d.ts `PriceUpdateParams`); absent keys are left untouched. */
export const buildPriceUpdateParams = (patch: PricePatch): Stripe.PriceUpdateParams => ({
	...(patch.isActive !== undefined ? { active: patch.isActive } : {}),
	...(patch.nickname !== undefined ? { nickname: patch.nickname ?? "" } : {}),
	...(patch.lookupKey !== undefined ? { lookup_key: patch.lookupKey ?? "" } : {}),
	...(patch.transferLookupKey ? { transfer_lookup_key: true } : {}),
});

/** Escapes a value for Stripe's search query language (single-quoted string). */
const searchLiteral = (value: string): string => `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

/** Active products first, then the most recently created: the adoption target when several exist. */
const preferredProduct = (products: Stripe.Product[]): Stripe.Product | null =>
	[...products].sort((a, b) => Number(b.active) - Number(a.active) || b.created - a.created)[0] ?? null;

export const createCatalogProvider = (getClient: () => Stripe): CatalogProvider => ({
	async createProduct(input, idempotencyKey): Promise<ProviderProductSnapshot> {
		const product = await callStripe("product create", () =>
			getClient().products.create(buildProductCreateParams(input), { idempotencyKey }),
		);
		return toProductSnapshot(product);
	},

	async updateProduct(providerId, input, idempotencyKey): Promise<ProviderProductSnapshot> {
		const product = await callStripe("product update", () =>
			getClient().products.update(providerId, buildProductUpdateParams(input), { idempotencyKey }),
		);
		return toProductSnapshot(product);
	},

	async archiveProduct(providerId, idempotencyKey): Promise<ProviderProductSnapshot> {
		const product = await callStripe("product archive", () =>
			getClient().products.update(providerId, { active: false }, { idempotencyKey }),
		);
		return toProductSnapshot(product);
	},

	async retrieveProduct(providerId): Promise<ProviderProductSnapshot | null> {
		const product = await retrieveStripe("product retrieve", () => getClient().products.retrieve(providerId));
		return product ? toProductSnapshot(product) : null;
	},

	/**
	 * Search is eventually consistent (Stripe: up to about a minute after creation), so a product created
	 * moments ago may not be found yet; callers treat `null` as "not found yet", never as proof of absence.
	 */
	async findProductByEntity(entityKey): Promise<ProviderProductSnapshot | null> {
		const query = `metadata['${PROVIDER_METADATA.entity}']:${searchLiteral(entityKey)}`;
		const result = await callStripe("product search", () => getClient().products.search({ query, limit: 10 }));
		const product = preferredProduct(result.data);
		return product ? toProductSnapshot(product) : null;
	},

	async createPrice(input, idempotencyKey): Promise<ProviderPriceSnapshot> {
		const price = await callStripe("price create", () =>
			getClient().prices.create(buildPriceCreateParams(input), { idempotencyKey }),
		);
		return toPriceSnapshot(price);
	},

	async updatePrice(providerId, patch, idempotencyKey): Promise<ProviderPriceSnapshot> {
		const price = await callStripe("price update", () =>
			getClient().prices.update(providerId, buildPriceUpdateParams(patch), { idempotencyKey }),
		);
		return toPriceSnapshot(price);
	},

	async retrievePrice(providerId): Promise<ProviderPriceSnapshot | null> {
		const price = await retrieveStripe("price retrieve", () => getClient().prices.retrieve(providerId));
		return price ? toPriceSnapshot(price) : null;
	},
});
