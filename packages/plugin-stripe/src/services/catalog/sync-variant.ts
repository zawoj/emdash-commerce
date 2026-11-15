import type { Product, Variant } from "../../core/catalog.js";
import type { CatalogProvider, ProviderProductInput } from "../../ports/payment-provider.js";
import type { CatalogMirror } from "../../adapters/emdash/content/catalog-mirror.js";
import type { CatalogLinkStore, Clock } from "../../ports/repositories.js";
import { isVariantProviderActive } from "./active.js";
import { writeProviderProduct, type ProductWriteMode } from "./product-write.js";

const variantName = (product: Product, variant: Variant): string => `${product.title} — ${variant.title}`;

const inputOf = (entityKey: string, product: Product, variant: Variant, isActive: boolean): ProviderProductInput => ({
	entityKey,
	name: variantName(product, variant),
	description: product.description,
	imageUrls: product.imageUrls,
	isActive,
	taxCode: product.taxCode,
	extraMetadata: {},
});

const writeVariant = async (
	catalog: CatalogProvider,
	store: CatalogLinkStore,
	clock: Clock,
	entityKey: string,
	input: ProviderProductInput,
	mode: ProductWriteMode,
	variant: Variant,
	mirror: CatalogMirror,
): Promise<void> => {
	const result = await writeProviderProduct(catalog, store, clock, entityKey, input, mode);
	if (!result?.hasChanged) return;
	await mirror.writeVariantSync(variant.id, { stripeProductId: result.providerId, stripeSyncStatus: "synced", stripeSyncError: null });
};

export const syncVariantEntity = (
	catalog: CatalogProvider,
	store: CatalogLinkStore,
	clock: Clock,
	entityKey: string,
	product: Product,
	variant: Variant,
	mirror: CatalogMirror,
): Promise<void> =>
	writeVariant(catalog, store, clock, entityKey, inputOf(entityKey, product, variant, isVariantProviderActive(product, variant)), { kind: "upsert" }, variant, mirror);

export const archiveVariantEntity = (
	catalog: CatalogProvider,
	store: CatalogLinkStore,
	clock: Clock,
	entityKey: string,
	product: Product,
	variant: Variant,
	mirror: CatalogMirror,
): Promise<void> => writeVariant(catalog, store, clock, entityKey, inputOf(entityKey, product, variant, false), { kind: "archive-only" }, variant, mirror);
