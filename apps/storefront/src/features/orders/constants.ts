/** Query parameter of the guest order link (the plugin's `emails.orderViewPath` default is `/orders/view?token={TOKEN}`). */
export const ORDER_TOKEN_PARAM = "token";

/** Matches the upper bound of the plugin's token schema; a longer value cannot be a token and is not sent upstream. */
export const ORDER_TOKEN_MAX_LENGTH = 2048;

/** What the page can show for a guest link. */
export const ORDER_LINK_STATES = {
	ok: "ok",
	invalid: "invalid",
	unavailable: "unavailable",
} as const;
export type OrderLinkState = (typeof ORDER_LINK_STATES)[keyof typeof ORDER_LINK_STATES];

/** Payment statuses of the plugin (`payment_status`), as they reach the storefront. */
export const PAYMENT_STATUSES = {
	pending: "pending",
	paid: "paid",
	failed: "failed",
	partiallyRefunded: "partially_refunded",
	refunded: "refunded",
	disputed: "disputed",
	disputeLost: "dispute_lost",
	cancelled: "cancelled",
} as const;

/** Fulfilment statuses of the plugin (`fulfillment_status`). */
export const FULFILLMENT_STATUSES = {
	unfulfilled: "unfulfilled",
	partiallyFulfilled: "partially_fulfilled",
	fulfilled: "fulfilled",
	partiallyReturned: "partially_returned",
	returned: "returned",
} as const;
