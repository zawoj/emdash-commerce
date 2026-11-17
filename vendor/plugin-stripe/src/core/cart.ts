import type { BillingInterval, PriceType, SellableRef } from "./catalog.js";
import type { CurrencyCode, Money } from "./money.js";

/**
 * A cart is server state addressed by an unguessable id (the bearer secret). The client only ever
 * sends price ids and quantities; amounts, currency and checkout mode are derived on the server.
 */

export const CART_STATUS = {
	active: "active",
	/** A Checkout Session is open for the cart; lines are frozen until it completes or expires. */
	checkoutOpen: "checkout_open",
	converted: "converted",
	abandoned: "abandoned",
	expired: "expired",
} as const;
export type CartStatus = (typeof CART_STATUS)[keyof typeof CART_STATUS];

export interface CartLine {
	priceId: string;
	quantity: number;
	addedAt: string;
}

export interface CartCheckout {
	sessionId: string;
	reservationId: string | null;
	expiresAt: string;
}

export interface CartRequestContext {
	userAgent: string | null;
	country: string | null;
}

export interface Cart {
	id: string;
	status: CartStatus;
	lines: CartLine[];
	email: string | null;
	checkout: CartCheckout | null;
	orderId: string | null;
	context: CartRequestContext;
	createdAt: string;
	updatedAt: string;
	expiresAt: string;
}

export const CART_ISSUE = {
	priceNotFound: "PRICE_NOT_FOUND",
	priceInactive: "PRICE_INACTIVE",
	productUnpublished: "PRODUCT_UNPUBLISHED",
	variantInactive: "VARIANT_INACTIVE",
	outOfStock: "OUT_OF_STOCK",
	insufficientStock: "INSUFFICIENT_STOCK",
	mixedCurrency: "MIXED_CURRENCY",
	mixedInterval: "MIXED_INTERVAL",
	notSynced: "NOT_SYNCED",
	quantityLimit: "QUANTITY_LIMIT",
	/** Raised by a site's `validateCart` extension. */
	custom: "CUSTOM",
} as const;
export type CartIssueCode = (typeof CART_ISSUE)[keyof typeof CART_ISSUE];

export interface CartIssue {
	code: CartIssueCode;
	/** Null for cart-wide issues. */
	priceId: string | null;
	message: string;
	/** Units still available when the issue is about stock. */
	available?: number;
}

export interface PricedCartLine {
	priceId: string;
	productId: string;
	variantId: string | null;
	sellable: SellableRef;
	title: string;
	variantTitle: string | null;
	quantity: number;
	unitAmount: Money;
	lineTotal: Money;
	priceType: PriceType;
	interval: BillingInterval | null;
	intervalCount: number | null;
	trialDays: number | null;
	/** Units available to this cart right now; null when stock is not tracked. */
	available: number | null;
}

export type CheckoutMode = "payment" | "subscription";

export interface PricedCart {
	cart: Cart;
	lines: PricedCartLine[];
	currency: CurrencyCode | null;
	subtotal: Money | null;
	itemCount: number;
	/** Null when the cart is empty. */
	mode: CheckoutMode | null;
	issues: CartIssue[];
	/** True when there is at least one line and no issue. */
	isCheckoutReady: boolean;
}
