import { toPrice, toProduct, toVariant } from "../../adapters/emdash/content/catalog-mapper.js";
import { asString, type ContentEntry } from "../../adapters/emdash/content/values.js";
import { RELATIONS_PAGE_SIZE, type RelationEntry, type RelationPage } from "../../adapters/emdash/relations/port.js";
import { PRODUCT_FIELD, VARIANT_FIELD } from "../../adapters/emdash/schema/field-names.js";
import { type Price, type Product, type Variant } from "../../core/catalog.js";
import { CommerceError } from "../../core/errors.js";
import type { CommerceContainer } from "../../plugin/container.js";
import { loadAxes, type ProductAxes } from "../catalog/axes.js";

/** Published products scanned per request (100 per page); a larger catalog needs a paged API. */
export const MAX_PUBLISHED_PRODUCTS = 1000;
const PAGE = 100;
const BATCH = 10;

export const mapBatched = async <TIn, TOut>(items: readonly TIn[], read: (item: TIn) => Promise<TOut>): Promise<TOut[]> => {
	const out: TOut[] = [];
	for (let start = 0; start < items.length; start += BATCH) out.push(...(await Promise.all(items.slice(start, start + BATCH).map(read))));
	return out;
};

export interface NamedLink {
	id: string;
	name: string;
	slug: string;
}

/** What a product links to, read live (brand / categories / type) and with drafts (variants, prices: helper collections). */
export interface ProductLinks {
	typeId: string | null;
	brand: NamedLink | null;
	categories: NamedLink[];
	variantIds: string[];
	priceIds: string[];
}

export interface Candidate {
	entry: ContentEntry;
	product: Product;
	links: ProductLinks;
}

const bounded = (page: RelationPage, what: string): RelationEntry[] => {
	if (page.hasMore) throw new CommerceError("catalogLimitExceeded", `${what} holds more than ${RELATIONS_PAGE_SIZE} links; the storefront reads at most ${RELATIONS_PAGE_SIZE}.`, { limit: RELATIONS_PAGE_SIZE });
	return page.items;
};

const namedOf = (entry: RelationEntry): NamedLink | null => (entry.slug ? { id: entry.id, name: entry.title ?? entry.slug, slug: entry.slug } : null);
const notNull = <T>(value: T | null): value is T => value !== null;

/** Two relation reads per product: the editorial links live, the helper collections' links including drafts. */
export const readLinks = async (container: CommerceContainer, productId: string): Promise<ProductLinks> => {
	const slugs = container.options.collections;
	const [live, helpers] = await Promise.all([
		container.relations.fields(slugs.products, productId, [PRODUCT_FIELD.productType, PRODUCT_FIELD.brand, PRODUCT_FIELD.categories], { includeDrafts: false, limit: RELATIONS_PAGE_SIZE }),
		container.relations.fields(slugs.products, productId, [PRODUCT_FIELD.variants, PRODUCT_FIELD.prices], { includeDrafts: true, limit: RELATIONS_PAGE_SIZE }),
	]);
	return {
		typeId: live[PRODUCT_FIELD.productType]!.items[0]?.id ?? null,
		brand: live[PRODUCT_FIELD.brand]!.items.map(namedOf).find(notNull) ?? null,
		categories: bounded(live[PRODUCT_FIELD.categories]!, `The categories of product ${productId}`).map(namedOf).filter(notNull),
		variantIds: bounded(helpers[PRODUCT_FIELD.variants]!, `The variants of product ${productId}`).map((entry) => entry.id),
		priceIds: bounded(helpers[PRODUCT_FIELD.prices]!, `The prices of product ${productId}`).map((entry) => entry.id),
	};
};

export const toCandidate = async (container: CommerceContainer, entry: ContentEntry): Promise<Candidate> => {
	const links = await readLinks(container, entry.id);
	return { entry, product: toProduct(entry, { typeId: links.typeId, brandId: links.brand?.id ?? null, categoryIds: links.categories.map((category) => category.id) }), links };
};

/** Every published product entry (the live columns), up to MAX_PUBLISHED_PRODUCTS. */
export const listPublishedEntries = async (container: CommerceContainer): Promise<ContentEntry[]> => {
	const content = container.content;
	if (!content) throw new Error("This container has no raw content access");
	const entries: ContentEntry[] = [];
	let cursor: string | undefined;
	do {
		const page = await content.list(container.options.collections.products, { where: { status: "published" }, limit: PAGE, cursor });
		entries.push(...page.items);
		cursor = page.hasMore ? page.cursor : undefined;
	} while (cursor && entries.length < MAX_PUBLISHED_PRODUCTS);
	return entries;
};

/** A variant entry as the card read sees it: option values come from the derived `options_key` (no relation read). */
export interface LiteVariant {
	variant: Variant;
	entry: ContentEntry;
}

const valueIdsOfKey = (key: string | null): string[] => (key ? key.split("|").filter(Boolean) : []);

export const readLiteVariants = async (container: CommerceContainer, productId: string, ids: readonly string[]): Promise<LiteVariant[]> => {
	const slugs = container.options.collections;
	const content = container.content;
	if (!content) throw new Error("This container has no raw content access");
	const read = await mapBatched(ids, async (id): Promise<LiteVariant | null> => {
		const entry = await content.get(slugs.variants, id);
		if (!entry) return null;
		let valueIds = valueIdsOfKey(asString(entry.data[VARIANT_FIELD.optionsKey]));
		if (valueIds.length === 0) {
			// Not derived yet (a variant saved a moment ago): the relation is the authority.
			const page = await container.relations.children(slugs.variants, id, VARIANT_FIELD.optionValues, { includeDrafts: true, limit: RELATIONS_PAGE_SIZE });
			valueIds = bounded(page, `The option values of variant ${id}`).map((link) => link.id);
		}
		const variant = toVariant(entry, { productId, optionValueIds: valueIds });
		return variant ? { variant, entry } : null;
	});
	return read.filter(notNull);
};

/** The prices linked to a product or variant (`ids` from its `prices` relation). */
export const readPrices = async (container: CommerceContainer, productId: string, variantId: string | null, ids: readonly string[]): Promise<Price[]> => {
	const content = container.content;
	if (!content) throw new Error("This container has no raw content access");
	const prices = await mapBatched(ids, async (id) => {
		const entry = await content.get(container.options.collections.prices, id);
		return entry ? toPrice(entry, { productId, variantId }) : null;
	});
	return prices.filter(notNull);
};

export const readVariantPriceIds = async (container: CommerceContainer, variantId: string): Promise<string[]> => {
	const page = await container.relations.children(container.options.collections.variants, variantId, VARIANT_FIELD.prices, { includeDrafts: true, limit: RELATIONS_PAGE_SIZE });
	return bounded(page, `The prices of variant ${variantId}`).map((entry) => entry.id);
};

/** Axes per product type, read once per request. */
export const axesCache = (container: CommerceContainer): ((typeId: string | null) => Promise<ProductAxes>) => {
	const cache = new Map<string, Promise<ProductAxes>>();
	return (typeId) => {
		if (!typeId) return loadAxes(container.catalog, null);
		const cached = cache.get(typeId);
		if (cached) return cached;
		const pending = loadAxes(container.catalog, typeId);
		cache.set(typeId, pending);
		return pending;
	};
};
