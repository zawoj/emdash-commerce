import type { Price, Product, Variant } from "../../core/catalog.js";

export const isProductProviderActive = (product: Product): boolean => product.isPublished;

export const isVariantProviderActive = (product: Product, variant: Variant): boolean => product.isPublished && variant.isActive;

export const isPriceSellable = (product: Product, variant: Variant | null, price: Price): boolean => {
	if (!product.isPublished || !price.isActive) return false;
	if (price.variantId && (!variant || !variant.isActive)) return false;
	return true;
};

export const isPriceProviderActive = (product: Product, variant: Variant | null, price: Price): boolean => isPriceSellable(product, variant, price);
