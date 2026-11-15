import { asString } from "../../adapters/emdash/content/values.js";
import { PRODUCT_FIELD, VARIANT_FIELD } from "../../adapters/emdash/schema/field-names.js";
import type { ProductCardView } from "../../contracts/api.js";
import { selectDefaultPrice } from "../../core/price-selection.js";
import { sellableKey } from "../../core/catalog.js";
import type { CommerceContainer } from "../../plugin/container.js";
import type { ProductAxes } from "../catalog/axes.js";
import { variantAmountOf } from "../catalog/managed-prices.js";
import { isSizeAxis } from "./axis-rules.js";
import { axesCache, readLiteVariants, readPrices, type Candidate } from "./load.js";
import { excerptOf, galleryOf, imagesOf, uniqueImages, type StorefrontImage } from "./media.js";
import { loadAvailabilities, mergeAvailability, STOCK_STATE, type Availability } from "./stock.js";

export interface CardBuilder {
	/** The card of a product, or null when it cannot be sold (no active variant with a price, no usable price). */
	build(candidate: Candidate): Promise<ProductCardView | null>;
}

/** A variant's own picture followed by its gallery. */
export const variantImages = (data: Record<string, unknown>, fallbackAlt: string): StorefrontImage[] => [
	...imagesOf(data[VARIANT_FIELD.image], fallbackAlt),
	...galleryOf(data[VARIANT_FIELD.gallery], fallbackAlt),
];

const linkView = (link: { name: string; slug: string }) => ({ name: link.name, slug: link.slug });

/**
 * Builds listing cards. Products with variants are priced from the `price` columns (variant override, else product
 * price: exactly what the managed price entries mirror) and their variants' option values come from the derived
 * `options_key`; a simple product is priced from the entry `selectDefaultPrice` picks. One inventory read per card.
 */
export const createCardBuilder = (container: CommerceContainer): CardBuilder => {
	const axesOf = axesCache(container);
	const currency = container.options.supportedCurrencies[0]!;

	const sizesOf = (axes: ProductAxes, variants: ReadonlyArray<{ valueIds: string[]; state: Availability["state"] }>): ProductCardView["sizes"] => {
		const axis = axes.axes.find((candidate) => isSizeAxis(candidate.attribute));
		if (!axis) return [];
		return axis.attribute.values.flatMap((value) => {
			const holders = variants.filter((variant) => variant.valueIds.includes(value.id));
			return holders.length > 0 ? [{ label: value.label, isAvailable: holders.some((holder) => holder.state !== STOCK_STATE.soldOut) }] : [];
		});
	};

	return {
		async build({ entry, product, links }) {
			const base = {
				id: product.id,
				slug: product.slug,
				title: product.title,
				excerpt: excerptOf(entry.data[PRODUCT_FIELD.description]),
				createdAt: entry.createdAt,
				brand: links.brand ? linkView(links.brand) : null,
				categories: links.categories.map(linkView),
				hasVariants: product.hasVariants,
			};
			const ownImages = [...imagesOf(entry.data[PRODUCT_FIELD.image], product.title), ...galleryOf(entry.data[PRODUCT_FIELD.gallery], product.title)];

			if (!product.hasVariants) {
				const prices = await readPrices(container, product.id, null, links.priceIds);
				const selected = selectDefaultPrice(prices);
				if (!selected) return null;
				const stock = await loadAvailabilities(container, [{ ref: { kind: "product", id: product.id }, policy: product.inventory }]);
				return {
					...base,
					images: uniqueImages(ownImages),
					price: { amount: selected.unitAmount, currency: selected.currency, isRange: false, priceId: selected.id },
					availability: stock.get(sellableKey({ kind: "product", id: product.id })) ?? { state: STOCK_STATE.inStock, lowCount: null },
					sizes: [],
				};
			}

			const lite = await readLiteVariants(container, product.id, links.variantIds);
			const sellable = lite.flatMap(({ variant, entry: variantEntry }) => {
				const amount = variantAmountOf(product, variant);
				return variant.isActive && amount !== null ? [{ variant, entry: variantEntry, amount }] : [];
			});
			if (sellable.length === 0) return null;
			const [stock, axes] = await Promise.all([
				loadAvailabilities(container, sellable.map(({ variant }) => ({ ref: { kind: "variant" as const, id: variant.id }, policy: variant.inventory }))),
				axesOf(links.typeId),
			]);
			const states = sellable.map(({ variant, amount }) => ({ variant, amount, availability: stock.get(sellableKey({ kind: "variant", id: variant.id }))! }));
			const amounts = states.map((state) => state.amount);
			const min = Math.min(...amounts);
			return {
				...base,
				images: uniqueImages([...ownImages, ...sellable.flatMap(({ variant, entry: variantEntry }) => variantImages(variantEntry.data, asString(variantEntry.data[VARIANT_FIELD.title]) ?? variant.title))]),
				price: { amount: min, currency, isRange: Math.max(...amounts) !== min, priceId: null },
				availability: mergeAvailability(states.map((state) => state.availability)),
				sizes: sizesOf(axes, states.map((state) => ({ valueIds: state.variant.optionValueIds, state: state.availability.state }))),
			};
		},
	};
};
