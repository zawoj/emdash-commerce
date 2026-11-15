export const CART_API = {
	summary: "/api/cart/summary",
} as const;

export const CART_EVENTS = {
	changed: "cart:changed",
	open: "cart:open",
} as const;

export const SUMMARY_HTML_PARAM = "html";

export const LINE_FIELDS = {
	quantityPrefix: "quantity",
	remove: "remove",
} as const;
