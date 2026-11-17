import {
	BILLING_INTERVAL,
	PRICE_TYPE,
	TAX_BEHAVIOR,
	type BillingInterval,
	type Price,
	type PriceType,
	type Product,
	type TaxBehavior,
	type Variant,
} from "../../../core/catalog.js";
import { optionsKeyOf } from "../../../core/catalog-rules.js";
import {
	ATTRIBUTE_INPUT_TYPE,
	ATTRIBUTE_PRESENTATION,
	type Attribute,
	type AttributeInputType,
	type AttributePresentation,
	type AttributeValue,
	type Brand,
	type Category,
	type ProductSpecs,
	type ProductType,
	type SpecValue,
} from "../../../core/product-type.js";
import { isCurrencyCode, toCurrencyCode } from "../../../core/money.js";
import {
	ATTRIBUTE_FIELD,
	ATTRIBUTE_VALUE_FIELD,
	BRAND_FIELD,
	CATEGORY_FIELD,
	PRICE_FIELD,
	PRODUCT_FIELD,
	PRODUCT_TYPE_FIELD,
	VARIANT_FIELD,
} from "../schema/field-names.js";
import { asArray, asBool, asInt, asRecord, asString, oneOf, oneOfOrNull, type ContentEntry } from "./values.js";
import { resolveGallery, resolveMediaImage } from "./media.js";

/** Plain text of a Portable Text document (what Stripe receives as the product description). */
export const portableTextToPlainText = (value: unknown): string | null => {
	const blocks = asArray(value);
	const lines: string[] = [];
	for (const block of blocks) {
		const record = asRecord(block);
		const children = asArray(record?.children);
		const line = children
			.map((child) => asString(asRecord(child)?.text) ?? "")
			.join("")
			.trim();
		if (line) lines.push(line);
	}
	const joined = lines.join("\n");
	return joined.length > 0 ? joined : (typeof value === "string" ? asString(value.trim()) : null);
};

/** The public URLs an `image` field value resolves to (see `resolveMediaImage`); URLs may be site-relative. */
export const imageUrlsOf = (value: unknown): string[] => {
	const image = resolveMediaImage(value);
	return image ? [image.url] : [];
};

/** A minor-unit amount field: a non-negative integer, else null (unset or unusable). */
const asAmount = (value: unknown): number | null => {
	const amount = asInt(value);
	return amount !== null && amount >= 0 ? amount : null;
};

const isSpecValue = (value: unknown): value is SpecValue =>
	typeof value === "string" || typeof value === "number" || typeof value === "boolean" || (Array.isArray(value) && value.every((entry) => typeof entry === "string"));

/** The `specs` JSON snapshot; anything that is not `{ attributeId: value }` is dropped entry by entry. */
export const parseSpecs = (value: unknown): ProductSpecs => {
	const record = asRecord(value);
	if (!record) return {};
	return Object.fromEntries(Object.entries(record).filter((entry): entry is [string, SpecValue] => isSpecValue(entry[1])));
};

/** The links a product carries (relation fields, read through `RelationsPort`). */
export interface ProductLinks {
	typeId: string | null;
	brandId: string | null;
	categoryIds: string[];
}
export const NO_PRODUCT_LINKS: ProductLinks = { typeId: null, brandId: null, categoryIds: [] };

export const toProduct = (item: ContentEntry, links: ProductLinks = NO_PRODUCT_LINKS): Product => {
	const data = item.data;
	return {
		id: item.id,
		slug: item.slug ?? "",
		title: asString(data[PRODUCT_FIELD.title]) ?? "",
		description: portableTextToPlainText(data[PRODUCT_FIELD.description]),
		imageUrls: imageUrlsOf(data[PRODUCT_FIELD.image]),
		isPublished: item.status === "published",
		hasVariants: asBool(data[PRODUCT_FIELD.hasVariants]),
		inventory: { isTracked: asBool(data[PRODUCT_FIELD.trackInventory]), allowsBackorder: asBool(data[PRODUCT_FIELD.allowBackorder]) },
		taxCode: asString(data[PRODUCT_FIELD.taxCode]),
		price: asAmount(data[PRODUCT_FIELD.price]),
		sku: asString(data[PRODUCT_FIELD.sku]),
		typeId: links.typeId,
		brandId: links.brandId,
		categoryIds: links.categoryIds,
		specs: parseSpecs(data[PRODUCT_FIELD.specs]),
	};
};

export interface VariantLinks {
	productId: string | null;
	optionValueIds: string[];
}

/** A variant without a product link is unusable and reads as missing. */
export const toVariant = (item: ContentEntry, links: VariantLinks): Variant | null => {
	const data = item.data;
	if (!links.productId) return null;
	return {
		id: item.id,
		productId: links.productId,
		title: asString(data[VARIANT_FIELD.title]) ?? "",
		sku: asString(data[VARIANT_FIELD.sku]),
		optionValueIds: links.optionValueIds,
		optionsKey: optionsKeyOf(links.optionValueIds),
		price: asAmount(data[VARIANT_FIELD.price]),
		imageUrls: [...new Set([...imageUrlsOf(data[VARIANT_FIELD.image]), ...resolveGallery(data[VARIANT_FIELD.gallery]).map((image) => image.url)])],
		isActive: asBool(data[VARIANT_FIELD.isActive], true),
		inventory: { isTracked: asBool(data[VARIANT_FIELD.trackInventory]), allowsBackorder: asBool(data[VARIANT_FIELD.allowBackorder]) },
	};
};

export interface PriceLinks {
	/** The owning product; for a price of a variant, the variant's product. */
	productId: string | null;
	/** Set when the price belongs to a variant. */
	variantId: string | null;
}

/** A price that cannot be priced (no product link, bad currency, no amount, recurring without interval) reads as missing. */
export const toPrice = (item: ContentEntry, links: PriceLinks): Price | null => {
	const data = item.data;
	const { productId } = links;
	const unitAmount = asInt(data[PRICE_FIELD.unitAmount]);
	const currency = asString(data[PRICE_FIELD.currency])?.toLowerCase();
	if (!productId || unitAmount === null || unitAmount < 0 || !currency || !isCurrencyCode(currency)) return null;
	const type: PriceType = oneOf(data[PRICE_FIELD.type], Object.values(PRICE_TYPE), PRICE_TYPE.oneTime);
	const interval: BillingInterval | null = oneOfOrNull(data[PRICE_FIELD.interval], Object.values(BILLING_INTERVAL));
	if (type === PRICE_TYPE.recurring && !interval) return null;
	const trialDays = asInt(data[PRICE_FIELD.trialDays]);
	return {
		id: item.id,
		productId,
		variantId: links.variantId,
		nickname: asString(data[PRICE_FIELD.nickname]),
		type,
		unitAmount,
		currency: toCurrencyCode(currency),
		recurring:
			type === PRICE_TYPE.recurring && interval
				? { interval, intervalCount: Math.max(1, asInt(data[PRICE_FIELD.intervalCount]) ?? 1), trialDays: trialDays && trialDays > 0 ? trialDays : null }
				: null,
		taxBehavior: oneOf<TaxBehavior>(data[PRICE_FIELD.taxBehavior], Object.values(TAX_BEHAVIOR), TAX_BEHAVIOR.unspecified),
		lookupKey: asString(data[PRICE_FIELD.lookupKey]),
		isActive: asBool(data[PRICE_FIELD.isActive], true),
		isDefault: asBool(data[PRICE_FIELD.isDefault]),
		isManaged: asBool(data[PRICE_FIELD.isManaged]),
	};
};

// --- Product model vocabulary ------------------------------------------------------------------------------------

export const toAttributeValue = (item: ContentEntry, attributeId: string): AttributeValue => ({
	id: item.id,
	attributeId,
	label: asString(item.data[ATTRIBUTE_VALUE_FIELD.label]) ?? "",
	code: asString(item.data[ATTRIBUTE_VALUE_FIELD.code]),
	swatch: asString(item.data[ATTRIBUTE_VALUE_FIELD.swatch]),
});

export const toAttribute = (item: ContentEntry, values: AttributeValue[]): Attribute => {
	const data = item.data;
	const name = asString(data[ATTRIBUTE_FIELD.name]) ?? "";
	return {
		id: item.id,
		name,
		storefrontLabel: asString(data[ATTRIBUTE_FIELD.storefrontLabel]) ?? name,
		code: asString(data[ATTRIBUTE_FIELD.code]),
		inputType: oneOf<AttributeInputType>(data[ATTRIBUTE_FIELD.inputType], Object.values(ATTRIBUTE_INPUT_TYPE), ATTRIBUTE_INPUT_TYPE.select),
		presentation: oneOf<AttributePresentation>(data[ATTRIBUTE_FIELD.presentation], Object.values(ATTRIBUTE_PRESENTATION), ATTRIBUTE_PRESENTATION.buttons),
		unit: asString(data[ATTRIBUTE_FIELD.unit]),
		isFilterable: asBool(data[ATTRIBUTE_FIELD.isFilterable]),
		values,
	};
};

export interface ProductTypeLinks {
	variantAxisIds: string[];
	allowedValueIds: string[];
	specAttributeIds: string[];
	requiredSpecIds: string[];
}

export const toProductType = (item: ContentEntry, links: ProductTypeLinks): ProductType => ({
	id: item.id,
	name: asString(item.data[PRODUCT_TYPE_FIELD.name]) ?? "",
	code: asString(item.data[PRODUCT_TYPE_FIELD.code]),
	...links,
});

export const toBrand = (item: ContentEntry): Brand => ({
	id: item.id,
	slug: item.slug ?? "",
	name: asString(item.data[BRAND_FIELD.name]) ?? "",
	imageUrls: imageUrlsOf(item.data[BRAND_FIELD.logo]),
	website: asString(item.data[BRAND_FIELD.website]),
	intro: asString(item.data[BRAND_FIELD.intro]),
});

export const toCategory = (item: ContentEntry, parentId: string | null): Category => ({
	id: item.id,
	slug: item.slug ?? "",
	name: asString(item.data[CATEGORY_FIELD.name]) ?? "",
	imageUrls: imageUrlsOf(item.data[CATEGORY_FIELD.image]),
	intro: asString(item.data[CATEGORY_FIELD.intro]),
	parentId,
});
