import type { CurrencyCode } from "./money.js";
import type { ProductSpecs } from "./product-type.js";

/**
 * Catalog model. EmDash content is the source of truth; Stripe Products and Prices mirror it.
 *
 * - A `Product` is what an editor publishes. Without variants it is itself the sellable unit.
 * - A `Variant` is a sellable combination of the product's options (size M + colour blue).
 * - A `Price` belongs to a product and optionally to one variant. A cart line points at a price,
 *   which pins product, variant, amount, currency and billing in one id (the Stripe model).
 */

export const PRICE_TYPE = {
	oneTime: "one_time",
	recurring: "recurring",
} as const;
export type PriceType = (typeof PRICE_TYPE)[keyof typeof PRICE_TYPE];

export const BILLING_INTERVAL = {
	day: "day",
	week: "week",
	month: "month",
	year: "year",
} as const;
export type BillingInterval = (typeof BILLING_INTERVAL)[keyof typeof BILLING_INTERVAL];

export const TAX_BEHAVIOR = {
	unspecified: "unspecified",
	inclusive: "inclusive",
	exclusive: "exclusive",
} as const;
export type TaxBehavior = (typeof TAX_BEHAVIOR)[keyof typeof TAX_BEHAVIOR];

export interface Product {
	id: string;
	slug: string;
	title: string;
	/** Plain-text description for Stripe; the rich body stays in EmDash. */
	description: string | null;
	imageUrls: string[];
	isPublished: boolean;
	hasVariants: boolean;
	/** Product-level inventory, used only when `hasVariants` is false. */
	inventory: InventoryPolicy;
	/** Stripe tax code (txcd_…) or null for the account default. */
	taxCode: string | null;
	/** Base price in minor units of the store's default currency; the variants' fallback. Null = none set. */
	price: number | null;
	/** SKU of a product without variants. */
	sku: string | null;
	/** Product type (variant axes + specification attributes) or null. */
	typeId: string | null;
	brandId: string | null;
	categoryIds: string[];
	/** Saved specification values by attribute id (rows of attributes no longer in the type are ignored on read). */
	specs: ProductSpecs;
}

export interface Variant {
	id: string;
	productId: string;
	title: string;
	sku: string | null;
	/** One value id per product-type axis, in axis order. */
	optionValueIds: string[];
	/** Sorted `optionValueIds` joined with `|`: identical combinations share a key. Empty when no values are linked. */
	optionsKey: string;
	/** Override of the product price (minor units); null = the product price. */
	price: number | null;
	/** The variant image followed by its gallery rows, de-duplicated by URL. */
	imageUrls: string[];
	isActive: boolean;
	inventory: InventoryPolicy;
}

export interface InventoryPolicy {
	isTracked: boolean;
	/** When tracked, whether checkout may go below zero. */
	allowsBackorder: boolean;
}

export interface RecurringTerms {
	interval: BillingInterval;
	intervalCount: number;
	trialDays: number | null;
}

export interface Price {
	id: string;
	productId: string;
	/** Null when the price applies to the product itself (no variants). */
	variantId: string | null;
	nickname: string | null;
	type: PriceType;
	unitAmount: number;
	currency: CurrencyCode;
	recurring: RecurringTerms | null;
	taxBehavior: TaxBehavior;
	/** Stable handle for storefronts and migrations (Stripe `lookup_key`), unique when set. */
	lookupKey: string | null;
	isActive: boolean;
	/** The price a storefront shows first for its product or variant. */
	isDefault: boolean;
	/** True for the entry the plugin keeps in sync with the product / variant `price` field; editors never change it. */
	isManaged: boolean;
}

/** The thing whose stock is counted: a variant, or a product without variants. */
export interface SellableRef {
	kind: "product" | "variant";
	id: string;
}

export const sellableKey = (ref: SellableRef): string => `${ref.kind}:${ref.id}`;

export const sellableOfPrice = (price: Pick<Price, "productId" | "variantId">): SellableRef =>
	price.variantId ? { kind: "variant", id: price.variantId } : { kind: "product", id: price.productId };

/**
 * Fields whose change requires a new Stripe Price (Stripe prices are immutable in amount,
 * currency and recurrence). Anything else is an in-place update.
 */
export const priceTermsFingerprint = (price: Price): string =>
	[
		price.unitAmount,
		price.currency,
		price.type,
		price.recurring?.interval ?? "",
		price.recurring?.intervalCount ?? "",
		price.taxBehavior,
	].join("|");
