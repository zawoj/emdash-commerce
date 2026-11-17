import type { Price, Product, Variant } from "../../core/catalog.js";
import type { Attribute, AttributeValue, Brand, Category, ProductType } from "../../core/product-type.js";
import type { CatalogRepository } from "../../ports/repositories.js";
import { clone, tick, toCursorPage } from "./runtime.js";

export interface InMemoryCatalog extends CatalogRepository {
	addProduct(product: Product): void;
	addVariant(variant: Variant): void;
	addPrice(price: Price): void;
	addProductType(type: ProductType): void;
	/** Registers the attribute and its values (`attribute.values`). */
	addAttribute(attribute: Attribute): void;
	addBrand(brand: Brand): void;
	addCategory(category: Category): void;
	/** Simulates an editor deleting an entry (references in other entries are left as they are, like EmDash). */
	remove(kind: "product" | "variant" | "price", id: string): void;
}

export const createInMemoryCatalog = (): InMemoryCatalog => {
	const products = new Map<string, Product>();
	const variants = new Map<string, Variant>();
	const prices = new Map<string, Price>();
	const types = new Map<string, ProductType>();
	const attributes = new Map<string, Attribute>();
	const brands = new Map<string, Brand>();
	const categories = new Map<string, Category>();
	const found = <T>(map: Map<string, T>, id: string): T | null => {
		const value = map.get(id);
		return value ? clone(value) : null;
	};
	return {
		addProduct: (product) => void products.set(product.id, clone(product)),
		addVariant: (variant) => void variants.set(variant.id, clone(variant)),
		addPrice: (price) => void prices.set(price.id, clone(price)),
		addProductType: (type) => void types.set(type.id, clone(type)),
		addAttribute: (attribute) => void attributes.set(attribute.id, clone(attribute)),
		addBrand: (brand) => void brands.set(brand.id, clone(brand)),
		addCategory: (category) => void categories.set(category.id, clone(category)),
		remove: (kind, id) => void (kind === "product" ? products : kind === "variant" ? variants : prices).delete(id),
		async getProduct(id) {
			await tick();
			return found(products, id);
		},
		async getProductBySlug(slug) {
			await tick();
			const match = [...products.values()].find((product) => product.slug === slug);
			return match ? clone(match) : null;
		},
		async getVariant(id) {
			await tick();
			return found(variants, id);
		},
		async listVariants(productId) {
			await tick();
			return [...variants.values()].filter((variant) => variant.productId === productId).map(clone);
		},
		async getPrice(id) {
			await tick();
			return found(prices, id);
		},
		async getPrices(ids) {
			await tick();
			const result = new Map<string, Price>();
			for (const id of ids) {
				const price = prices.get(id);
				if (price) result.set(id, clone(price));
			}
			return result;
		},
		async listPrices(productId) {
			await tick();
			return [...prices.values()].filter((price) => price.productId === productId).map(clone);
		},
		async listProducts(cursor, limit) {
			await tick();
			return toCursorPage([...products.values()].map(clone), cursor, limit);
		},
		async getProductType(id) {
			await tick();
			return found(types, id);
		},
		async getAttribute(id) {
			await tick();
			return found(attributes, id);
		},
		async getAttributeValues(ids) {
			await tick();
			const wanted = new Set(ids);
			const result = new Map<string, AttributeValue>();
			for (const attribute of attributes.values()) {
				for (const value of attribute.values) if (wanted.has(value.id)) result.set(value.id, clone(value));
			}
			return result;
		},
		async getBrand(id) {
			await tick();
			return found(brands, id);
		},
		async getCategory(id) {
			await tick();
			return found(categories, id);
		},
	};
};
