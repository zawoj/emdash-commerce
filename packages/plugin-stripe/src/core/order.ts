import type { CheckoutMode } from "./cart.js";
import type { Address } from "./customer.js";
import type { CurrencyCode } from "./money.js";

/**
 * The payment axis is driven only by provider events (webhooks or reconciliation), never by a browser.
 * `transitionOrder` (order-state.ts) is the single place that decides the next payment status; every
 * handler calls it, so out-of-order and repeated events converge on the same state.
 */

/**
 * An order has three independent status axes:
 * - payment status (`ORDER_PAYMENT_STATUS`): provider-driven, decided only by `transitionOrder`;
 * - order (lifecycle) status (`ORDER_LIFECYCLE_STATUS`): a human's decision through the admin actions
 *   (`planOrderAction` in order-lifecycle.ts), never changed by a provider event;
 * - fulfillment status (`FULFILLMENT_STATUS`): a human's decision, set through the admin.
 */

export const ORDER_PAYMENT_STATUS = {
	/** Session completed, payment still processing (bank transfer, BLIK pending, …). */
	pending: "pending",
	paid: "paid",
	failed: "failed",
	partiallyRefunded: "partially_refunded",
	refunded: "refunded",
	disputed: "disputed",
	disputeLost: "dispute_lost",
	/** The payment was abandoned or cancelled at the provider (the `CANCELLED` event); not the order lifecycle. */
	cancelled: "cancelled",
} as const;
export type OrderPaymentStatus = (typeof ORDER_PAYMENT_STATUS)[keyof typeof ORDER_PAYMENT_STATUS];

/** @deprecated The payment axis was renamed; use `ORDER_PAYMENT_STATUS`. Removed after the next release. */
export const ORDER_STATUS = ORDER_PAYMENT_STATUS;
/** @deprecated Use `OrderPaymentStatus`. Removed after the next release. */
export type OrderStatus = OrderPaymentStatus;

export const ORDER_LIFECYCLE_STATUS = {
	open: "open",
	completed: "completed",
	cancelled: "cancelled",
	archived: "archived",
} as const;
export type OrderLifecycleStatus = (typeof ORDER_LIFECYCLE_STATUS)[keyof typeof ORDER_LIFECYCLE_STATUS];

export const FULFILLMENT_STATUS = {
	unfulfilled: "unfulfilled",
	partiallyFulfilled: "partially_fulfilled",
	fulfilled: "fulfilled",
	partiallyReturned: "partially_returned",
	returned: "returned",
} as const;
export type FulfillmentStatus = (typeof FULFILLMENT_STATUS)[keyof typeof FULFILLMENT_STATUS];

/** Why an order needs a human look; set by settlement checks, never blocks recording the payment. */
export const REVIEW_FLAG = {
	amountMismatch: "amount_mismatch",
	lineItemsMismatch: "line_items_mismatch",
	currencyMismatch: "currency_mismatch",
	missingSnapshot: "missing_snapshot",
	inventoryShortfall: "inventory_shortfall",
	livemodeMismatch: "livemode_mismatch",
} as const;
export type ReviewFlag = (typeof REVIEW_FLAG)[keyof typeof REVIEW_FLAG];

export const ORDER_EVENT = {
	paymentSucceeded: "PAYMENT_SUCCEEDED",
	paymentFailed: "PAYMENT_FAILED",
	cancelled: "CANCELLED",
	refundUpdated: "REFUND_UPDATED",
	disputeOpened: "DISPUTE_OPENED",
	disputeWon: "DISPUTE_WON",
	disputeLost: "DISPUTE_LOST",
} as const;

export type OrderEvent =
	| { type: typeof ORDER_EVENT.paymentSucceeded }
	| { type: typeof ORDER_EVENT.paymentFailed }
	| { type: typeof ORDER_EVENT.cancelled }
	/** `amountRefunded` is the provider's cumulative total, not a delta, so replays are harmless. */
	| { type: typeof ORDER_EVENT.refundUpdated; amountRefunded: number; amountTotal: number }
	| { type: typeof ORDER_EVENT.disputeOpened }
	| { type: typeof ORDER_EVENT.disputeWon }
	| { type: typeof ORDER_EVENT.disputeLost };

/**
 * Allowed transitions. Anything not listed is ignored (and logged) by `transitionOrder`, which
 * returns the current status unchanged — a late `PAYMENT_FAILED` cannot un-pay an order.
 *
 * pending            → paid | failed | cancelled
 * failed             → paid                       (customer retried and a later payment succeeded)
 * paid               → partially_refunded | refunded | disputed
 * partially_refunded → partially_refunded | refunded | disputed
 * disputed           → <status before the dispute> (won) | dispute_lost (lost)
 * refunded, dispute_lost, cancelled → terminal
 *
 * REFUND_UPDATED derives the target from amounts: refunded when amountRefunded >= amountTotal,
 * partially_refunded when 0 < amountRefunded < amountTotal, no change when 0.
 */
export interface OrderTransitionResult {
	status: OrderPaymentStatus;
	/** Set when entering `disputed`, so a won dispute can restore it. */
	statusBeforeDispute: OrderPaymentStatus | null;
	isChanged: boolean;
}

/**
 * A snapshot of what was bought, stored as a scalar repeater on the order (title, SKU and option labels are
 * copied, so a later catalog edit never rewrites history).
 */
export interface OrderLine {
	priceId: string;
	productId: string;
	variantId: string | null;
	title: string;
	variantTitle: string | null;
	sku: string | null;
	/** Human-readable option labels, e.g. "Size: M, Colour: Black"; null for a product without options. */
	optionsText: string | null;
	quantity: number;
	unitAmount: number;
	/** Before discounts and tax (`unitAmount * quantity` unless the provider reports otherwise). */
	amountSubtotal: number;
	discountAmount: number;
	taxAmount: number;
	/** What the buyer paid for the line: subtotal - discount + tax. */
	amountTotal: number;
	priceType: "one_time" | "recurring";
	stripePriceId: string;
}

export interface OrderTotals {
	subtotal: number;
	discount: number;
	tax: number;
	shipping: number;
	total: number;
	refunded: number;
	currency: CurrencyCode;
}

export interface Order {
	id: string;
	orderNumber: string;
	/** Lifecycle axis (open, completed, cancelled, archived). */
	orderStatus: OrderLifecycleStatus;
	/** Payment axis; replaces the former `status`. */
	paymentStatus: OrderPaymentStatus;
	statusBeforeDispute: OrderPaymentStatus | null;
	fulfillmentStatus: FulfillmentStatus;
	mode: CheckoutMode;
	customerId: string | null;
	email: string;
	customerName: string | null;
	phone: string | null;
	billingAddress: Address | null;
	shippingAddress: Address | null;
	lines: OrderLine[];
	totals: OrderTotals;
	reviewFlags: ReviewFlag[];
	cartId: string | null;
	subscriptionId: string | null;
	stripe: {
		checkoutSessionId: string;
		paymentIntentId: string | null;
		customerId: string | null;
		subscriptionId: string | null;
		invoiceId: string | null;
		isLivemode: boolean;
	};
	placedAt: string;
	paidAt: string | null;
}
