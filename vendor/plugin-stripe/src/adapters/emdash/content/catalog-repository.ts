import type { ContentAccess } from "emdash";

import type { CommerceOptions } from "../../../contracts/options.js";
import type { Price, Product, Variant } from "../../../core/catalog.js";
import { CommerceError } from "../../../core/errors.js";
import type { Attribute, AttributeValue } from "../../../core/product-type.js";
import type { CatalogRepository, Page } from "../../../ports/repositories.js";
import { RELATIONS_PAGE_SIZE, type RelationEntry, type RelationPage, type RelationsPort } from "../relations/port.js";
import {
	ATTRIBUTE_FIELD,
	ATTRIBUTE_VALUE_FIELD,
	CATEGORY_FIELD,
	PRICE_FIELD,
	PRODUCT_FIELD,
	PRODUCT_TYPE_FIELD,
	VARIANT_FIELD,
} from "../schema/field-names.js";
import { toAttribute, toAttributeValue, toBrand, toCategory, toPrice, toProduct, toProductType, toVariant } from "./catalog-mapper.js";
import type { ContentEntry } from "./values.js";

type CollectionSlugs = CommerceOptions["collections"];

const MAX_LIST_LIMIT = 100;
const SLUG_SCAN_PAGES = 20;
/** Concurrent entry reads when one parent has many children (at most 50, so a few waves). */
const READ_BATCH = 10;

const notNull = <T>(value: T | null): value is T => value !== null;

/** Runs `read` over `items` a batch at a time, keeping the order. */
const mapInBatches = async <TIn, TOut>(items: readonly TIn[], read: (item: TIn) => Promise<TOut>): Promise<TOut[]> => {
	const results: TOut[] = [];
	for (let start = 0; start < items.length; start += READ_BATCH) {
		results.push(...(await Promise.all(items.slice(start, start + READ_BATCH).map(read))));
	}
	return results;
};

/**
 * One bounded relation read. Relation reads return one page of at most 50 links; a field with more throws
 * instead of quietly showing part of it (a cart must never price against half a variant list).
 */
const boundedIds = (page: RelationPage, what: string): string[] => {
	if (page.hasMore) {
		throw new CommerceError("catalogLimitExceeded", `${what} holds more than ${RELATIONS_PAGE_SIZE} links; the commerce plugin reads at most ${RELATIONS_PAGE_SIZE}.`, { limit: RELATIONS_PAGE_SIZE });
	}
	return page.items.map((entry: RelationEntry) => entry.id);
};

const firstId = (page: RelationPage): string | null => page.items[0]?.id ?? null;

/**
 * Catalog reads over content (columns) and `RelationsPort` (links).
 *
 * - `get` / `list` return the published (live) column data: a collection that keeps revisions holds drafts in
 *   revisions, so an unpublished edit never reaches a cart or Stripe.
 * - A product's own links (type, brand, categories) are read live (`includeDrafts: false`): an unpublished brand or
 *   an edit still staged in the product's draft is not visible. The helper collections (variants, prices,
 *   attribute values) have no draft workflow of their own, so their links are read with `includeDrafts: true`;
 *   a variant's `is_active` switch, not its publication status, decides whether it sells.
 * - Bounded relations (variants per product, prices per sellable, values per attribute, the lists of a product
 *   type) are capped at one 50-link page; more throws `CATALOG_LIMIT_EXCEEDED`.
 */
export const createCatalogRepository = (content: ContentAccess, relations: RelationsPort, slugs: CollectionSlugs): CatalogRepository => {
	const productLinks = async (id: string) => {
		const fields = await relations.fields(slugs.products, id, [PRODUCT_FIELD.productType, PRODUCT_FIELD.brand, PRODUCT_FIELD.categories], { includeDrafts: false, limit: RELATIONS_PAGE_SIZE });
		return {
			typeId: firstId(fields[PRODUCT_FIELD.productType]!),
			brandId: firstId(fields[PRODUCT_FIELD.brand]!),
			categoryIds: boundedIds(fields[PRODUCT_FIELD.categories]!, `The categories of product ${id}`),
		};
	};
	const withLinks = async (item: ContentEntry): Promise<Product> => toProduct(item, await productLinks(item.id));

	const readVariant = async (item: ContentEntry, knownProductId?: string): Promise<Variant | null> => {
		const fields = await relations.fields(slugs.variants, item.id, [VARIANT_FIELD.product, VARIANT_FIELD.optionValues], { includeDrafts: true, limit: RELATIONS_PAGE_SIZE });
		return toVariant(item, {
			productId: knownProductId ?? firstId(fields[VARIANT_FIELD.product]!),
			optionValueIds: boundedIds(fields[VARIANT_FIELD.optionValues]!, `The option values of variant ${item.id}`),
		});
	};

	const variantIdsOf = async (productId: string): Promise<string[]> =>
		boundedIds(await relations.children(slugs.products, productId, PRODUCT_FIELD.variants, { includeDrafts: true, limit: RELATIONS_PAGE_SIZE }), `The variants of product ${productId}`);

	/** A variant's product, memoised per call so a batch of prices of one variant reads it once. */
	const productOfVariant = (cache: Map<string, Promise<string | null>>) => (variantId: string): Promise<string | null> => {
		const cached = cache.get(variantId);
		if (cached) return cached;
		const pending = relations.parentOf(slugs.variants, variantId, VARIANT_FIELD.product, { includeDrafts: true }).then((entry) => entry?.id ?? null);
		cache.set(variantId, pending);
		return pending;
	};

	const readPrice = async (item: ContentEntry, productOf: (variantId: string) => Promise<string | null>): Promise<Price | null> => {
		const fields = await relations.fields(slugs.prices, item.id, [PRICE_FIELD.product, PRICE_FIELD.variant], { includeDrafts: true, limit: 1 });
		const variantId = firstId(fields[PRICE_FIELD.variant]!);
		const productId = variantId ? await productOf(variantId) : firstId(fields[PRICE_FIELD.product]!);
		return toPrice(item, { productId, variantId });
	};

	const pricesByIds = async (ids: readonly string[]): Promise<Price[]> => {
		const productOf = productOfVariant(new Map());
		const prices = await mapInBatches(ids, async (id) => {
			const item = await content.get(slugs.prices, id);
			return item ? readPrice(item, productOf) : null;
		});
		return prices.filter(notNull);
	};

	const boundedPriceIds = async (collection: string, id: string, field: string, what: string): Promise<string[]> =>
		boundedIds(await relations.children(collection, id, field, { includeDrafts: true, limit: RELATIONS_PAGE_SIZE }), what);

	return {
		async getProduct(id) {
			const item = await content.get(slugs.products, id);
			return item ? withLinks(item) : null;
		},
		async getProductBySlug(slug) {
			// `content.list` cannot filter on the slug system column, so published products are scanned page by
			// page. Fine for a small catalog; a large one should resolve slugs through the storefront's own loader.
			let cursor: string | undefined;
			for (let page = 0; page < SLUG_SCAN_PAGES; page += 1) {
				const result = await content.list(slugs.products, { where: { status: "published" }, limit: MAX_LIST_LIMIT, cursor });
				const found = result.items.find((item) => item.slug === slug);
				if (found) return withLinks(found);
				if (!result.hasMore || !result.cursor) return null;
				cursor = result.cursor;
			}
			return null;
		},
		async getVariant(id) {
			const item = await content.get(slugs.variants, id);
			return item ? readVariant(item) : null;
		},
		async listVariants(productId) {
			const ids = await variantIdsOf(productId);
			const variants = await mapInBatches(ids, async (id) => {
				const item = await content.get(slugs.variants, id);
				return item ? readVariant(item, productId) : null;
			});
			return variants.filter(notNull);
		},
		async getPrice(id) {
			const item = await content.get(slugs.prices, id);
			return item ? readPrice(item, productOfVariant(new Map())) : null;
		},
		async getPrices(ids) {
			const prices = await pricesByIds([...new Set(ids)]);
			return new Map(prices.map((price) => [price.id, price]));
		},
		async listPrices(productId) {
			const own = await boundedPriceIds(slugs.products, productId, PRODUCT_FIELD.prices, `The prices of product ${productId}`);
			const perVariant = await mapInBatches(await variantIdsOf(productId), (variantId) =>
				boundedPriceIds(slugs.variants, variantId, VARIANT_FIELD.prices, `The prices of variant ${variantId}`),
			);
			return pricesByIds([...own, ...perVariant.flat()]);
		},
		async listProducts(cursor, limit) {
			const page = await content.list(slugs.products, { limit: Math.min(Math.max(limit, 1), MAX_LIST_LIMIT), cursor: cursor ?? undefined });
			const items = await mapInBatches(page.items, withLinks);
			return { items, cursor: page.hasMore ? (page.cursor ?? null) : null } satisfies Page<Product>;
		},
		async getProductType(id) {
			const item = await content.get(slugs.productTypes, id);
			if (!item) return null;
			const fields = await relations.fields(
				slugs.productTypes,
				id,
				[PRODUCT_TYPE_FIELD.variantAxes, PRODUCT_TYPE_FIELD.allowedValues, PRODUCT_TYPE_FIELD.specAttributes, PRODUCT_TYPE_FIELD.requiredSpecs],
				{ includeDrafts: true, limit: RELATIONS_PAGE_SIZE },
			);
			return toProductType(item, {
				variantAxisIds: boundedIds(fields[PRODUCT_TYPE_FIELD.variantAxes]!, `The variant axes of product type ${id}`),
				allowedValueIds: boundedIds(fields[PRODUCT_TYPE_FIELD.allowedValues]!, `The allowed values of product type ${id}`),
				specAttributeIds: boundedIds(fields[PRODUCT_TYPE_FIELD.specAttributes]!, `The specification attributes of product type ${id}`),
				requiredSpecIds: boundedIds(fields[PRODUCT_TYPE_FIELD.requiredSpecs]!, `The required specifications of product type ${id}`),
			});
		},
		async getAttribute(id): Promise<Attribute | null> {
			const item = await content.get(slugs.attributes, id);
			if (!item) return null;
			const valueIds = boundedIds(await relations.children(slugs.attributes, id, ATTRIBUTE_FIELD.values, { includeDrafts: true, limit: RELATIONS_PAGE_SIZE }), `The values of attribute ${id}`);
			const values = await mapInBatches(valueIds, async (valueId) => {
				const valueItem = await content.get(slugs.attributeValues, valueId);
				return valueItem ? toAttributeValue(valueItem, id) : null;
			});
			return toAttribute(item, values.filter(notNull));
		},
		async getAttributeValues(ids) {
			const found = new Map<string, AttributeValue>();
			const values = await mapInBatches([...new Set(ids)], async (id) => {
				const item = await content.get(slugs.attributeValues, id);
				if (!item) return null;
				const attribute = await relations.parentOf(slugs.attributeValues, id, ATTRIBUTE_VALUE_FIELD.attribute, { includeDrafts: true });
				return toAttributeValue(item, attribute?.id ?? "");
			});
			for (const value of values) if (value) found.set(value.id, value);
			return found;
		},
		async getBrand(id) {
			const item = await content.get(slugs.brands, id);
			return item ? toBrand(item) : null;
		},
		async getCategory(id) {
			const item = await content.get(slugs.categories, id);
			if (!item) return null;
			const parent = await relations.parentOf(slugs.categories, id, CATEGORY_FIELD.parent, { includeDrafts: false });
			return toCategory(item, parent?.id ?? null);
		},
	};
};
