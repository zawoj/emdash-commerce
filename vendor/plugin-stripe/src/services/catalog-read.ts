import type { z } from "zod";

import type { availabilityView, CatalogProductsQuery, CatalogProductView, CatalogProductsView, ProductDetailView } from "../contracts/api.js";
import { axisValuesOf } from "../core/catalog-rules.js";
import { sellableKey, sellableOfPrice, type Price, type Product, type SellableRef, type Variant } from "../core/catalog.js";
import type { Attribute, ProductType } from "../core/product-type.js";
import { CommerceError } from "../core/errors.js";
import type { CommerceContainer } from "../plugin/container.js";
import { loadCatalogFor, loadSyncLinks } from "./cart/pricing.js";
import { readAvailability } from "./inventory/availability.js";
import { productDetail } from "./storefront/detail.js";
import { listProductCards } from "./storefront/products.js";

export type AvailabilityView = z.infer<typeof availabilityView>;

export interface CatalogReadService {
	/** Published, sellable products as listing cards (`catalog/products`). */
	products(query: CatalogProductsQuery): Promise<CatalogProductsView>;
	/** A published product page: axes, variants with prices and availability, specs, related (`catalog/product`); 404 for an unknown, unpublished or unsellable slug. */
	product(slug: string): Promise<ProductDetailView>;
	/** @deprecated The 0.2 product view (`catalog/product-legacy`): a product with its active variants and prices; 404 for an unknown or unpublished slug. */
	legacyProduct(slug: string): Promise<CatalogProductView>;
	/** Purchasability and stock per price id; an unknown id is reported as not purchasable. */
	availability(priceIds: readonly string[]): Promise<AvailabilityView>;
}

const isStockAvailable = (policy: { isTracked: boolean; allowsBackorder: boolean }, available: number | null): boolean =>
	!policy.isTracked || policy.allowsBackorder || (available ?? 0) > 0;

/** Default price first, then the cheaper one, then by id so the order is stable. */
const comparePrices = (a: Price, b: Price): number => Number(b.isDefault) - Number(a.isDefault) || a.unitAmount - b.unitAmount || a.id.localeCompare(b.id);

/** The product type's axes as attributes, in axis order (none when the product has no type). */
const loadAxes = async (container: CommerceContainer, product: Product): Promise<{ type: ProductType | null; axes: Attribute[] }> => {
	const type = product.typeId ? await container.catalog.getProductType(product.typeId) : null;
	if (!type) return { type: null, axes: [] };
	const axes = await Promise.all(type.variantAxisIds.map((id) => container.catalog.getAttribute(id)));
	return { type, axes: axes.filter((axis): axis is Attribute => axis !== null) };
};

/**
 * Read model for storefront product pages. It never calls the payment provider: a price is purchasable
 * when the product, its variant and the price are active, the currency is supported and the catalog sync
 * has not failed (synced, or still pending: checkout resolves the real provider price). Stock is reported
 * next to it (`available`, `isAvailable`), not folded into purchasability.
 */
export const createCatalogReadService = (container: CommerceContainer): CatalogReadService => {
	const isBuyable = (price: Price, product: Product, variant: Variant | null, syncable: ReadonlySet<string>): boolean =>
		product.isPublished &&
		price.isActive &&
		(!price.variantId || Boolean(variant?.isActive)) &&
		container.options.supportedCurrencies.includes(price.currency) &&
		syncable.has(price.id);

	return {
		async products(query) {
			return { items: await listProductCards(container, query) };
		},

		product: (slug) => productDetail(container, slug),

		async legacyProduct(slug) {
			const product = await container.catalog.getProductBySlug(slug);
			if (!product || !product.isPublished) throw new CommerceError("notFound", "Product not found");
			const [allVariants, allPrices, { type, axes }] = await Promise.all([
				container.catalog.listVariants(product.id),
				container.catalog.listPrices(product.id),
				loadAxes(container, product),
			]);
			const variants = allVariants.filter((variant) => variant.isActive);
			const variantsById = new Map(variants.map((variant) => [variant.id, variant]));
			const prices = allPrices.filter((price) => price.isActive && (!price.variantId || variantsById.has(price.variantId))).sort(comparePrices);

			const sellables: SellableRef[] = product.hasVariants ? variants.map((variant) => ({ kind: "variant", id: variant.id })) : [{ kind: "product", id: product.id }];
			const [stock, links] = await Promise.all([readAvailability(container, sellables), loadSyncLinks(container, new Map(prices.map((price) => [price.id, price])))]);
			const syncable = new Set(links.keys());
			const availableOf = (ref: SellableRef): number | null => stock.get(sellableKey(ref)) ?? null;

			const optionValuesOf = (variant: Variant) =>
				axes.flatMap((axis) => {
					const value = axis.values.find((candidate) => variant.optionValueIds.includes(candidate.id));
					return value ? [{ name: axis.storefrontLabel, value: value.label }] : [];
				});
			const variantViews = variants.map((variant) => {
				const available = availableOf({ kind: "variant", id: variant.id });
				return {
					id: variant.id,
					title: variant.title,
					sku: variant.sku,
					optionValues: optionValuesOf(variant),
					available,
					isAvailable: isStockAvailable(variant.inventory, available),
				};
			});

			// A product with variants is as available as its variants: unlimited if any variant is untracked,
			// otherwise the sum of what is tracked.
			const tracked = variants.filter((variant) => variant.inventory.isTracked);
			const productAvailable = product.hasVariants
				? tracked.length === variants.length && variants.length > 0
					? variantViews.reduce((sum, view) => sum + (view.available ?? 0), 0)
					: null
				: availableOf({ kind: "product", id: product.id });
			const isAvailable = product.hasVariants ? variantViews.some((view) => view.isAvailable) : isStockAvailable(product.inventory, productAvailable);

			return {
				id: product.id,
				slug: product.slug,
				title: product.title,
				hasVariants: product.hasVariants,
				options: type ? axes.map((axis) => ({ name: axis.storefrontLabel, values: axisValuesOf(type, axis).map((value) => value.label) })) : [],
				variants: variantViews,
				prices: prices.map((price) => ({
					id: price.id,
					variantId: price.variantId,
					nickname: price.nickname,
					type: price.type,
					unitAmount: { amount: price.unitAmount, currency: price.currency },
					interval: price.recurring?.interval ?? null,
					intervalCount: price.recurring?.intervalCount ?? null,
					trialDays: price.recurring?.trialDays ?? null,
					lookupKey: price.lookupKey,
					isDefault: price.isDefault,
					isPurchasable: isBuyable(price, product, price.variantId ? (variantsById.get(price.variantId) ?? null) : null, syncable),
				})),
				available: productAvailable,
				isAvailable,
			};
		},

		async availability(priceIds) {
			const { prices, products, variants } = await loadCatalogFor(container, priceIds);
			const [links, stock] = await Promise.all([
				loadSyncLinks(container, prices),
				readAvailability(container, [...prices.values()].map(sellableOfPrice)),
			]);
			const syncable = new Set(links.keys());
			const result: AvailabilityView["prices"] = {};
			for (const id of priceIds) {
				const price = prices.get(id);
				const product = price ? products.get(price.productId) : undefined;
				if (!price || !product) {
					result[id] = { isPurchasable: false, available: null };
					continue;
				}
				const variant = price.variantId ? (variants.get(price.variantId) ?? null) : null;
				result[id] = { isPurchasable: isBuyable(price, product, variant, syncable), available: stock.get(sellableKey(sellableOfPrice(price))) ?? null };
			}
			return { prices: result };
		},
	};
};
