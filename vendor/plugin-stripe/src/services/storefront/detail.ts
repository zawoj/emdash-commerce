import { asString } from "../../adapters/emdash/content/values.js";
import { PRODUCT_FIELD } from "../../adapters/emdash/schema/field-names.js";
import type { ProductCardView, ProductDetailView } from "../../contracts/api.js";
import { sellableKey, type Price, type Variant } from "../../core/catalog.js";
import { CommerceError } from "../../core/errors.js";
import { selectDefaultPrice } from "../../core/price-selection.js";
import { ATTRIBUTE_INPUT_TYPE, type Attribute } from "../../core/product-type.js";
import type { CommerceContainer } from "../../plugin/container.js";
import { axisCodeOf, resolveOptions, valueCodeOf, type ProductAxes } from "../catalog/axes.js";
import { createCardBuilder } from "./cards.js";
import { isImageAxis } from "./axis-rules.js";
import { axesCache, listPublishedEntries, mapBatched, readPrices, readVariantPriceIds, toCandidate, type Candidate } from "./load.js";
import { bodyOf } from "./media.js";
import { loadAvailabilities, mergeAvailability, STOCK_STATE } from "./stock.js";

export const RELATED_LIMIT = 4;
const SLUG_PAGE = 100;
const SLUG_PAGES = 20;

const findPublishedEntry = async (container: CommerceContainer, slug: string) => {
	const content = container.content;
	if (!content) throw new Error("This container has no raw content access");
	let cursor: string | undefined;
	for (let page = 0; page < SLUG_PAGES; page += 1) {
		const result = await content.list(container.options.collections.products, { where: { status: "published" }, limit: SLUG_PAGE, cursor });
		const found = result.items.find((item) => item.slug === slug);
		if (found) return found;
		if (!result.hasMore || !result.cursor) return null;
		cursor = result.cursor;
	}
	return null;
};

const notFound = (): CommerceError => new CommerceError("notFound", "Product not found");

/** The specification rows, in the product type's order, with attribute and value labels resolved. */
const specRows = async (container: CommerceContainer, candidate: Candidate, axes: ProductAxes): Promise<ProductDetailView["specs"]> => {
	const type = axes.type;
	if (!type) return [];
	const attributes = await mapBatched(type.specAttributeIds, (id) => container.catalog.getAttribute(id));
	return attributes.flatMap((attribute) => {
		if (!attribute) return [];
		const text = specText(attribute, candidate.product.specs[attribute.id]);
		return text ? [{ label: attribute.storefrontLabel, value: text }] : [];
	});
};

const specText = (attribute: Attribute, value: unknown): string | null => {
	const labelOf = (id: unknown): string | null => attribute.values.find((candidate) => candidate.id === id)?.label ?? null;
	if (value === undefined || value === null) return null;
	if (attribute.inputType === ATTRIBUTE_INPUT_TYPE.select) return labelOf(value);
	if (attribute.inputType === ATTRIBUTE_INPUT_TYPE.multiSelect) {
		const labels = (Array.isArray(value) ? value : []).map(labelOf).filter((label): label is string => label !== null);
		return labels.length > 0 ? labels.join(", ") : null;
	}
	if (attribute.inputType === ATTRIBUTE_INPUT_TYPE.boolean) return value === true ? "Yes" : value === false ? "No" : null;
	if (typeof value === "number") return attribute.unit ? `${value} ${attribute.unit}` : String(value);
	return typeof value === "string" && value.trim() ? value.trim() : null;
};

const extraPriceView = (price: Price): ProductDetailView["extraPrices"][number] => ({
	priceId: price.id,
	amount: price.unitAmount,
	currency: price.currency,
	type: price.type,
	interval: price.recurring?.interval ?? null,
	intervalCount: price.recurring?.intervalCount ?? null,
	trialDays: price.recurring?.trialDays ?? null,
	nickname: price.nickname,
});

interface SellableVariant {
	variant: Variant;
	price: Price;
}

/** Active variants that have a price to buy at (the default price of the variant, see `selectDefaultPrice`). */
const sellableVariants = async (container: CommerceContainer, productId: string): Promise<SellableVariant[]> => {
	const variants = (await container.catalog.listVariants(productId)).filter((variant) => variant.isActive);
	const read = await mapBatched(variants, async (variant): Promise<SellableVariant | null> => {
		const prices = await readPrices(container, productId, variant.id, await readVariantPriceIds(container, variant.id));
		const price = selectDefaultPrice(prices);
		return price ? { variant, price } : null;
	});
	return read.filter((entry): entry is SellableVariant => entry !== null);
};

const relatedOf = async (container: CommerceContainer, self: Candidate): Promise<ProductCardView[]> => {
	const entries = (await listPublishedEntries(container)).filter((entry) => entry.id !== self.product.id);
	const candidates = await mapBatched(entries, (entry) => toCandidate(container, entry));
	const ownCategories = new Set(self.links.categories.map((category) => category.id));
	const rank = (candidate: Candidate): number =>
		candidate.links.categories.some((category) => ownCategories.has(category.id)) ? 0 : self.links.typeId && candidate.links.typeId === self.links.typeId ? 1 : 2;
	const matches = candidates
		.filter((candidate) => rank(candidate) < 2)
		.sort((a, b) => rank(a) - rank(b) || b.entry.createdAt.localeCompare(a.entry.createdAt) || a.product.id.localeCompare(b.product.id));
	const builder = createCardBuilder(container);
	const related: ProductCardView[] = [];
	for (let start = 0; start < matches.length && related.length < RELATED_LIMIT; start += RELATED_LIMIT) {
		const cards = await mapBatched(matches.slice(start, start + RELATED_LIMIT), (candidate) => builder.build(candidate));
		related.push(...cards.filter((card): card is ProductCardView => card !== null && card.availability.state !== STOCK_STATE.soldOut));
	}
	return related.slice(0, RELATED_LIMIT);
};

/** The product page: the card fields plus axes, variants with their prices and availability, specs, extra prices and related products. */
export const productDetail = async (container: CommerceContainer, slug: string): Promise<ProductDetailView> => {
	const entry = await findPublishedEntry(container, slug);
	if (!entry) throw notFound();
	const candidate = await toCandidate(container, entry);
	const { product, links } = candidate;
	const card = await createCardBuilder(container).build(candidate);
	if (!card) throw notFound();
	const axes = await axesCache(container)(links.typeId);
	const productPrices = await readPrices(container, product.id, null, links.priceIds);
	const extraPrices = productPrices
		.filter((price) => price.isActive && !price.isManaged)
		.sort((a, b) => a.unitAmount - b.unitAmount || a.id.localeCompare(b.id))
		.map(extraPriceView);
	const common = {
		description: bodyOf(entry.data[PRODUCT_FIELD.description]),
		sku: asString(entry.data[PRODUCT_FIELD.sku]),
		specs: await specRows(container, candidate, axes),
		extraPrices,
		related: await relatedOf(container, candidate),
	};
	if (!product.hasVariants) return { ...card, ...common, axes: [], variants: [] };

	const sellable = await sellableVariants(container, product.id);
	const stock = await loadAvailabilities(container, sellable.map(({ variant }) => ({ ref: { kind: "variant" as const, id: variant.id }, policy: variant.inventory })));
	const variants = sellable.map(({ variant, price }): ProductDetailView["variants"][number] => ({
		id: variant.id,
		sku: variant.sku,
		title: variant.title,
		options: Object.fromEntries(resolveOptions(axes.axes, variant.optionValueIds).map(({ axis, value }) => [axisCodeOf(axis), valueCodeOf(value)])),
		optionsKey: variant.optionsKey,
		isActive: variant.isActive,
		price: { amount: price.unitAmount, currency: price.currency, priceId: price.id },
		availability: stock.get(sellableKey({ kind: "variant", id: variant.id }))!,
		imageUrls: variant.imageUrls,
	}));
	const usedValueIds = new Set(sellable.flatMap(({ variant }) => variant.optionValueIds));
	const detailAxes = axes.axes.flatMap(({ attribute }) => {
		const values = attribute.values.filter((value) => usedValueIds.has(value.id)).map((value) => ({ id: value.id, code: valueCodeOf(value), label: value.label, swatch: value.swatch }));
		return values.length > 0
			? [{ attributeId: attribute.id, code: axisCodeOf(attribute), label: attribute.storefrontLabel, presentation: attribute.presentation, isImageAxis: isImageAxis(attribute), values }]
			: [];
	});
	if (variants.length === 0) throw notFound();
	const amounts = variants.map((variant) => variant.price.amount);
	const min = Math.min(...amounts);
	return {
		...card,
		...common,
		// The page shows what the variants actually sell at (their price entries), which is what the cart charges.
		price: { amount: min, currency: variants[0]!.price.currency, isRange: Math.max(...amounts) !== min, priceId: null },
		availability: mergeAvailability(variants.map((variant) => variant.availability)),
		axes: detailAxes,
		variants,
	};
};
