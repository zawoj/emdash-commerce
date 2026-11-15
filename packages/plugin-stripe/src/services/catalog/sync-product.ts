import type { Product } from "../../core/catalog.js";
import type { CatalogProvider, ProviderProductInput } from "../../ports/payment-provider.js";
import type { CatalogLinkStore, Clock } from "../../ports/repositories.js";
import { isProductProviderActive } from "./active.js";
import { writeProviderProduct } from "./product-write.js";

const inputOf = (entityKey: string, product: Product, isActive: boolean): ProviderProductInput => ({
	entityKey,
	name: product.title,
	description: product.description,
	imageUrls: product.imageUrls,
	isActive,
	taxCode: product.taxCode,
	extraMetadata: {},
});

export const syncProductEntity = async (
	catalog: CatalogProvider,
	store: CatalogLinkStore,
	clock: Clock,
	entityKey: string,
	product: Product,
): Promise<void> => {
	await writeProviderProduct(catalog, store, clock, entityKey, inputOf(entityKey, product, isProductProviderActive(product)), { kind: "upsert" });
};

export const archiveProductEntity = async (
	catalog: CatalogProvider,
	store: CatalogLinkStore,
	clock: Clock,
	entityKey: string,
	product: Product,
): Promise<void> => {
	await writeProviderProduct(catalog, store, clock, entityKey, inputOf(entityKey, product, false), { kind: "archive-only" });
};
