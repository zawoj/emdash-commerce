import type { CatalogEntityRef } from "../contracts.js";

export const productEntityKey = (productId: string): string => `product:${productId}`;
export const variantEntityKey = (variantId: string): string => `variant:${variantId}`;
export const priceEntityKey = (priceId: string): string => `price:${priceId}`;

export const entityKeyOf = (ref: CatalogEntityRef): string => `${ref.entity}:${ref.id}`;

export const parseEntityKey = (entityKey: string): CatalogEntityRef | null => {
	const index = entityKey.indexOf(":");
	if (index <= 0) return null;
	const entity = entityKey.slice(0, index);
	if (entity !== "product" && entity !== "variant" && entity !== "price") return null;
	return { entity, id: entityKey.slice(index + 1) };
};
