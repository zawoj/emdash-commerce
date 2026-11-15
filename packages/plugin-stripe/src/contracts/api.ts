import { z } from "zod";

/**
 * HTTP contract of the plugin, mounted by EmDash at `/_emdash/api/plugins/stripe-commerce/<route>`.
 * Storefronts import these schemas and types (`@emdash-commerce/plugin-stripe/contracts`); the plugin
 * validates every input with them at the boundary. Successful responses use EmDash's `{ data }`
 * envelope; failures carry a real HTTP status and `{ error: { code, message, details } }`.
 *
 * Cart identity: the cart id is a bearer secret (24 random bytes, base64url). Plugin routes cannot set
 * cookies, so the storefront stores it (cookie, localStorage) and sends it back as the
 * `x-commerce-cart` header; the `emdash_commerce_cart` cookie is read as a fallback.
 */

export const ROUTE = {
	// public
	catalogProducts: "catalog/products",
	catalogProduct: "catalog/product",
	/** @deprecated The 0.2 product view (`catalogLegacyProductView`); kept until the storefront moves to `catalog/product`. */
	catalogProductLegacy: "catalog/product-legacy",
	catalogAvailability: "catalog/availability",
	cart: "cart",
	cartLines: "cart/lines",
	checkout: "checkout",
	checkoutStatus: "checkout/status",
	ordersAccessLink: "orders/access-link",
	ordersView: "orders/view",
	customerPortal: "customer/portal",
	webhook: "webhook",
	// private (admin UI, MCP)
	admin: "admin",
	adminStatus: "admin/status",
	adminOrdersList: "admin/orders/list",
	adminOrdersGet: "admin/orders/get",
	adminOrdersRefund: "admin/orders/refund",
	adminOrdersFulfillment: "admin/orders/fulfillment",
	adminOrdersAction: "admin/orders/action",
	adminOrdersEvents: "admin/orders/events",
	adminOrdersNote: "admin/orders/note",
	/** Editor panel route (Block Kit) of the order timeline. */
	editorOrderTimeline: "editor/order-timeline",
	/** Editor panel routes (Block Kit) on products: the variant generator and the specification form. */
	editorVariants: "editor/variants",
	editorSpecification: "editor/specification",
	/** Editor action route on products: queue the product, its variants and prices for Stripe sync. */
	editorCatalogResync: "editor/catalog-resync",
	adminSubscriptionsCancel: "admin/subscriptions/cancel",
	adminInventoryGet: "admin/inventory/get",
	adminInventoryAdjust: "admin/inventory/adjust",
	adminCatalogResync: "admin/catalog/resync",
	adminWebhooksRegister: "admin/webhooks/register",
	adminWebhooksList: "admin/webhooks/list",
	adminWebhooksReplay: "admin/webhooks/replay",
	adminReconcile: "admin/reconcile",
	adminOutboxRetry: "admin/outbox/retry",
	adminCheckoutsSweep: "admin/checkouts/sweep",
} as const;

export const CART_HEADER = "x-commerce-cart" as const;
export const CART_COOKIE = "emdash_commerce_cart" as const;
export const CART_ID_PATTERN = /^[A-Za-z0-9_-]{32}$/;

const id = z.string().min(1).max(64);
const money = z.object({ amount: z.number().int(), currency: z.string() });

// --- Catalog ----------------------------------------------------------------------------------------

export const catalogProductQuery = z.object({ slug: z.string().min(1).max(200) });

// --- Storefront read API (catalog/products, catalog/product) -------------------------------------------------

const CATALOG_SORT = ["newest", "price-asc", "price-desc", "name"] as const;
export type CatalogSort = (typeof CATALOG_SORT)[number];

export const catalogProductsQuery = z.object({
	category: z.string().min(1).max(200).optional(),
	brand: z.string().min(1).max(200).optional(),
	limit: z.coerce.number().int().min(1).max(200).optional(),
	sort: z.enum(CATALOG_SORT).optional(),
});
export type CatalogProductsQuery = z.infer<typeof catalogProductsQuery>;

export const storefrontImageView = z.object({ url: z.string(), alt: z.string(), width: z.number().int().positive().optional(), height: z.number().int().positive().optional() });

export const availabilityStateView = z.object({
	state: z.enum(["in_stock", "low", "backorder", "sold_out"]),
	/** 1..5 only when `state` is low. */
	lowCount: z.number().int().min(1).max(5).nullable(),
});

const namedLink = z.object({ name: z.string(), slug: z.string() });

export const productCardView = z.object({
	id,
	slug: z.string(),
	title: z.string(),
	excerpt: z.string().nullable(),
	createdAt: z.string(),
	images: z.array(storefrontImageView),
	brand: namedLink.nullable(),
	categories: z.array(namedLink),
	price: z.object({ amount: z.number().int(), currency: z.string(), isRange: z.boolean(), priceId: id.nullable() }),
	availability: availabilityStateView,
	sizes: z.array(z.object({ label: z.string(), isAvailable: z.boolean() })),
	hasVariants: z.boolean(),
});
export type ProductCardView = z.infer<typeof productCardView>;

export const catalogProductsView = z.object({ items: z.array(productCardView) });
export type CatalogProductsView = z.infer<typeof catalogProductsView>;

export const productDetailView = productCardView.extend({
	description: z.array(z.record(z.string(), z.unknown())).nullable(),
	sku: z.string().nullable(),
	axes: z.array(
		z.object({
			attributeId: id,
			code: z.string(),
			label: z.string(),
			presentation: z.enum(["buttons", "swatch", "dropdown"]),
			isImageAxis: z.boolean(),
			values: z.array(z.object({ id, code: z.string(), label: z.string(), swatch: z.string().nullable() })),
		}),
	),
	variants: z.array(
		z.object({
			id,
			sku: z.string().nullable(),
			title: z.string(),
			options: z.record(z.string(), z.string()),
			optionsKey: z.string(),
			isActive: z.boolean(),
			price: z.object({ amount: z.number().int(), currency: z.string(), priceId: id }),
			availability: availabilityStateView,
			imageUrls: z.array(z.string()),
		}),
	),
	specs: z.array(z.object({ label: z.string(), value: z.string() })),
	extraPrices: z.array(
		z.object({
			priceId: id,
			amount: z.number().int(),
			currency: z.string(),
			type: z.enum(["one_time", "recurring"]),
			interval: z.enum(["day", "week", "month", "year"]).nullable(),
			intervalCount: z.number().int().nullable(),
			trialDays: z.number().int().nullable(),
			nickname: z.string().nullable(),
		}),
	),
	related: z.array(productCardView),
});
export type ProductDetailView = z.infer<typeof productDetailView>;

export const priceView = z.object({
	id,
	variantId: id.nullable(),
	nickname: z.string().nullable(),
	type: z.enum(["one_time", "recurring"]),
	unitAmount: money,
	interval: z.enum(["day", "week", "month", "year"]).nullable(),
	intervalCount: z.number().int().nullable(),
	trialDays: z.number().int().nullable(),
	lookupKey: z.string().nullable(),
	isDefault: z.boolean(),
	isPurchasable: z.boolean(),
});

export const variantView = z.object({
	id,
	title: z.string(),
	sku: z.string().nullable(),
	optionValues: z.array(z.object({ name: z.string(), value: z.string() })),
	/** Null when stock is not tracked. */
	available: z.number().int().nullable(),
	isAvailable: z.boolean(),
});

/** @deprecated The 0.2 product view served by `catalog/product-legacy`; use `productDetailView`. */
export const catalogLegacyProductView = z.object({
	id,
	slug: z.string(),
	title: z.string(),
	hasVariants: z.boolean(),
	options: z.array(z.object({ name: z.string(), values: z.array(z.string()) })),
	variants: z.array(variantView),
	prices: z.array(priceView),
	available: z.number().int().nullable(),
	isAvailable: z.boolean(),
});
/** @deprecated */
export type CatalogProductView = z.infer<typeof catalogLegacyProductView>;
/** @deprecated */
export const catalogProductView = catalogLegacyProductView;

export const catalogAvailabilityQuery = z.object({
	/** Comma-separated price ids, at most 50. */
	priceIds: z.string().transform((value) => value.split(",").filter(Boolean)).pipe(z.array(id).min(1).max(50)),
});

export const availabilityView = z.object({
	prices: z.record(z.string(), z.object({ isPurchasable: z.boolean(), available: z.number().int().nullable() })),
});

// --- Cart -------------------------------------------------------------------------------------------

export const cartLineInput = z.object({
	priceId: id,
	quantity: z.number().int().min(0).max(999),
	/** `add` increments an existing line, `set` replaces its quantity; quantity 0 with `set` removes it. */
	mode: z.enum(["add", "set"]).default("add"),
});

export const cartLineRemoveInput = z.object({ priceId: id });

export const cartIssueView = z.object({
	code: z.string(),
	priceId: z.string().nullable(),
	message: z.string(),
	available: z.number().int().optional(),
});

export const cartLineView = z.object({
	priceId: id,
	productId: id,
	variantId: id.nullable(),
	title: z.string(),
	variantTitle: z.string().nullable(),
	quantity: z.number().int(),
	unitAmount: money,
	lineTotal: money,
	priceType: z.enum(["one_time", "recurring"]),
	interval: z.enum(["day", "week", "month", "year"]).nullable(),
	intervalCount: z.number().int().nullable(),
	trialDays: z.number().int().nullable(),
	available: z.number().int().nullable(),
});

export const cartView = z.object({
	/** Persist and send back as `x-commerce-cart`. Changes only when a new cart was started. */
	cartId: z.string(),
	isNew: z.boolean(),
	status: z.enum(["active", "checkout_open", "converted", "abandoned", "expired"]),
	lines: z.array(cartLineView),
	itemCount: z.number().int(),
	subtotal: money.nullable(),
	mode: z.enum(["payment", "subscription"]).nullable(),
	issues: z.array(cartIssueView),
	isCheckoutReady: z.boolean(),
	expiresAt: z.string(),
});
export type CartView = z.infer<typeof cartView>;

// --- Checkout ---------------------------------------------------------------------------------------

export const checkoutInput = z.object({
	uiMode: z.enum(["hosted", "embedded"]).default("hosted"),
	email: z.string().email().max(254).optional(),
});

export const checkoutView = z.object({
	sessionId: z.string(),
	uiMode: z.enum(["hosted", "embedded"]),
	/** Hosted: redirect the buyer here. */
	url: z.string().nullable(),
	/** Embedded: pass to Stripe.js `initEmbeddedCheckout({ clientSecret })`. */
	clientSecret: z.string().nullable(),
	expiresAt: z.string(),
});
export type CheckoutView = z.infer<typeof checkoutView>;

export const checkoutStatusQuery = z.object({ session_id: z.string().min(1).max(255) });

/** Deliberately small: anyone holding the session id (it is in the success URL) can read this. */
export const checkoutStatusView = z.object({
	status: z.enum(["open", "complete", "expired"]),
	paymentStatus: z.enum(["paid", "unpaid", "no_payment_required"]),
	orderNumber: z.string().nullable(),
	/** The order's PAYMENT status (pending, paid, …), under the name it had before the order got a separate lifecycle status. */
	orderStatus: z.string().nullable(),
	/** e.g. "j***@example.com" */
	maskedEmail: z.string().nullable(),
});
export type CheckoutStatusView = z.infer<typeof checkoutStatusView>;

// --- Orders (guest access by signed token) ----------------------------------------------------------

export const ordersAccessLinkInput = z.object({
	email: z.string().email().max(254),
	orderNumber: z.string().min(1).max(40),
});

/** Always the same answer, whether or not the order exists (no enumeration). */
export const ordersAccessLinkView = z.object({ isAccepted: z.literal(true) });

export const ordersViewQuery = z.object({ token: z.string().min(20).max(2048) });

export const orderView = z.object({
	orderNumber: z.string(),
	/** @deprecated The payment status under its former name; read `paymentStatus`. */
	status: z.string(),
	/** Lifecycle axis: open, completed, cancelled, archived. */
	orderStatus: z.string(),
	paymentStatus: z.string(),
	fulfillmentStatus: z.string(),
	placedAt: z.string(),
	email: z.string(),
	customerName: z.string().nullable(),
	lines: z.array(
		z.object({
			title: z.string(),
			variantTitle: z.string().nullable(),
			quantity: z.number().int(),
			unitAmount: z.number().int(),
			amountTotal: z.number().int(),
		}),
	),
	totals: z.object({
		subtotal: z.number().int(),
		discount: z.number().int(),
		tax: z.number().int(),
		shipping: z.number().int(),
		total: z.number().int(),
		refunded: z.number().int(),
		currency: z.string(),
	}),
	hasSubscription: z.boolean(),
	canOpenPortal: z.boolean(),
});
export type OrderView = z.infer<typeof orderView>;

export const customerPortalInput = z.object({ token: z.string().min(20).max(2048) });
export const customerPortalView = z.object({ url: z.string() });

// --- Admin (private; also the MCP tools' input) -----------------------------------------------------

export const adminOrdersListInput = z.object({
	/** Payment status (pending, paid, failed, partially_refunded, refunded, disputed, dispute_lost, cancelled). */
	status: z.string().optional(),
	/** Lifecycle status (open, completed, cancelled, archived). */
	orderStatus: z.string().optional(),
	cursor: z.string().nullable().default(null),
	limit: z.number().int().min(1).max(100).default(25),
});
export const adminOrdersGetInput = z.object({ orderId: id.optional(), orderNumber: z.string().optional() }).refine(
	(value) => Boolean(value.orderId ?? value.orderNumber),
	"orderId or orderNumber is required",
);
export const adminOrdersRefundInput = z.object({
	orderId: id,
	/** Minor units; omit for the full refundable amount. */
	amount: z.number().int().min(1).optional(),
	reason: z.enum(["requested_by_customer", "duplicate", "fraudulent"]).optional(),
	note: z.string().max(500).optional(),
	restock: z.boolean().default(false),
	/** Client-chosen id that makes a repeated request safe (same id → same refund). */
	requestId: z.string().min(8).max(64),
});
export const adminOrdersFulfillmentInput = z.object({
	orderId: id,
	fulfillmentStatus: z.enum(["unfulfilled", "partially_fulfilled", "fulfilled", "partially_returned", "returned"]),
});
export const adminOrdersActionInput = z.object({
	orderId: id,
	action: z.enum(["complete", "cancel", "archive", "reopen"]),
});
export const adminOrdersEventsInput = z.object({
	orderId: id,
	cursor: z.string().nullable().default(null),
	limit: z.number().int().min(1).max(100).default(50),
});
export const adminOrdersNoteInput = z.object({ orderId: id, note: z.string().trim().min(1).max(500) });
export const adminSubscriptionsCancelInput = z.object({
	subscriptionId: id,
	atPeriodEnd: z.boolean().default(true),
});
export const adminInventoryGetInput = z.object({ kind: z.enum(["product", "variant"]), id });
export const adminInventoryAdjustInput = z.object({
	kind: z.enum(["product", "variant"]),
	id,
	delta: z.number().int().refine((value) => value !== 0, "delta must not be 0"),
	reason: z.string().min(1).max(200),
});
export const adminCatalogResyncInput = z.object({ productId: id.optional() });
export const adminWebhooksListInput = z.object({
	status: z.enum(["received", "processing", "processed", "failed", "dead", "ignored"]).default("failed"),
	cursor: z.string().nullable().default(null),
	limit: z.number().int().min(1).max(100).default(25),
});
export const adminWebhooksReplayInput = z.object({ eventId: z.string().min(1).max(255) });
export const adminReconcileInput = z.object({
	/** Seconds since epoch; defaults to the inbox cursor. */
	since: z.number().int().optional(),
});
export const adminCheckoutsSweepInput = z.object({
	/** Keeps unpaid checkouts this many hours after their session ended; omit for `checkout.abandonedRetentionHours`. */
	retentionHours: z.number().int().min(0).max(720).optional(),
});
export const adminOutboxRetryInput = z.object({ eventId: z.string().min(1).max(255) });
