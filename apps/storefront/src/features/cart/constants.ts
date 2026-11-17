export const CART_API = {
	summary: "/api/cart/summary",
	fragment: "/api/cart/fragment",
} as const;

export const CART_PAGE_FORM_ID = "cart-page-lines";

export const CART_EVENTS = {
	changed: "cart:changed",
	open: "cart:open",
} as const;

export const SUMMARY_HTML_PARAM = "html";

export const LINE_FIELDS = {
	quantityPrefix: "quantity",
	remove: "remove",
} as const;
