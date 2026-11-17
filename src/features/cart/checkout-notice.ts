/**
 * What the storefront does with a failed checkout start. The cart page shows the notice in its alert area; only a
 * genuine provider failure stays an error response.
 */

import type { CartCopy } from "./copy";

export const CHECKOUT_NOTICE_PARAM = "checkout";

export const CHECKOUT_NOTICE = {
	empty: "empty",
	notReady: "not_ready",
	rateLimited: "rate_limited",
} as const;
export type CheckoutNotice = (typeof CHECKOUT_NOTICE)[keyof typeof CHECKOUT_NOTICE];

type NoticeCopy = Pick<CartCopy, "checkoutNoticeEmpty" | "checkoutNoticeNotReady" | "checkoutNoticeRateLimited">;

const noticeMessages = (copy: NoticeCopy): Record<CheckoutNotice, string> => ({
	[CHECKOUT_NOTICE.empty]: copy.checkoutNoticeEmpty,
	[CHECKOUT_NOTICE.notReady]: copy.checkoutNoticeNotReady,
	[CHECKOUT_NOTICE.rateLimited]: copy.checkoutNoticeRateLimited,
});

const NOTICE_VALUES = new Set<string>(Object.values(CHECKOUT_NOTICE));

/** The message of a notice from the URL; an unknown value shows nothing, so the query string cannot inject text. */
export const checkoutNoticeMessage = (value: string | null, copy: NoticeCopy): string | null =>
	value && NOTICE_VALUES.has(value) ? noticeMessages(copy)[value as CheckoutNotice] : null;

const NOT_READY_CODES = new Set(["CART_NOT_CHECKOUT_READY", "CART_LOCKED", "INSUFFICIENT_STOCK", "CONFLICT"]);

/** The notice for a plugin error the shopper can fix on the cart page, or null for a failure that is ours or Stripe's. */
export const checkoutNoticeFor = (status: number, errorCode: string | undefined): CheckoutNotice | null => {
	if (status === 404 || errorCode === "NOT_FOUND") return CHECKOUT_NOTICE.empty;
	if (status === 429 || errorCode === "RATE_LIMITED") return CHECKOUT_NOTICE.rateLimited;
	if (errorCode && NOT_READY_CODES.has(errorCode)) return CHECKOUT_NOTICE.notReady;
	return null;
};

export const cartNoticeHref = (notice: CheckoutNotice): string => `/cart?${CHECKOUT_NOTICE_PARAM}=${notice}`;