/** Field slugs of the sales collections (orders, payments, subscriptions, customers, carts, order events). See `./index.ts` for the shared rules. */

/** Slugs of the native relations of the sales collections (`^[a-z][a-z0-9_]*$`, no hyphens). */
export const SALES_RELATION = {
	/** customers (parent) have many orders (child). */
	orderCustomer: "order_customer",
	/** customers (parent) have many subscriptions (child). */
	subscriptionCustomer: "subscription_customer",
	/** orders (parent) have the subscriptions they started (child); a subscription has one initial order. */
	subscriptionInitialOrder: "subscription_initial_order",
	/** orders (parent) have many payments (child). */
	paymentOrder: "payment_order",
	/** subscriptions (parent) have many payments (child). */
	paymentSubscription: "payment_subscription",
	/** orders (parent) have an ordered timeline of events (child). */
	orderTimeline: "order_timeline",
} as const;

export const ORDER_FIELD = {
	orderNumber: "order_number",
	/** Lifecycle axis: open, completed, cancelled, archived. */
	orderStatus: "order_status",
	/** Payment axis (provider-driven). */
	paymentStatus: "payment_status",
	statusBeforeDispute: "status_before_dispute",
	fulfillmentStatus: "fulfillment_status",
	orderMode: "order_mode",
	/** Relation field (child side of `order_customer`). */
	customer: "customer",
	/** Relation fields on the parent side of the subscription, payment and timeline relations. */
	subscriptions: "subscriptions",
	payments: "payments",
	events: "events",
	email: "email",
	customerName: "customer_name",
	phone: "phone",
	billingAddress: "billing_address",
	shippingAddress: "shipping_address",
	/** Scalar repeater snapshot of the lines (see `ORDER_LINE_FIELD`). */
	lines: "lines",
	subtotalAmount: "subtotal_amount",
	discountAmount: "discount_amount",
	taxAmount: "tax_amount",
	shippingAmount: "shipping_amount",
	totalAmount: "total_amount",
	refundedAmount: "refunded_amount",
	currency: "currency",
	reviewFlags: "review_flags",
	cartId: "cart_id",
	stripeCheckoutSessionId: "stripe_checkout_session_id",
	stripePaymentIntentId: "stripe_payment_intent_id",
	stripeCustomerId: "stripe_customer_id",
	stripeSubscriptionId: "stripe_subscription_id",
	stripeInvoiceId: "stripe_invoice_id",
	isLivemode: "is_livemode",
	placedAt: "placed_at",
	paidAt: "paid_at",
	notes: "notes",
} as const;

/** Sub-field slugs of the order lines repeater. Never `required`: EmDash validates draft saves too. */
export const ORDER_LINE_FIELD = {
	title: "title",
	variantTitle: "variant_title",
	sku: "sku",
	options: "options",
	quantity: "quantity",
	unitAmount: "unit_amount",
	subtotalAmount: "subtotal_amount",
	discountAmount: "discount_amount",
	taxAmount: "tax_amount",
	totalAmount: "total_amount",
	productId: "product_id",
	variantId: "variant_id",
	priceId: "price_id",
	stripePriceId: "stripe_price_id",
	priceType: "price_type",
} as const;

export const PAYMENT_FIELD = {
	/** Relation field (child side of `payment_order`); `orderId` mirrors it as an indexed key for queries. */
	order: "order",
	orderId: "order_id",
	/** Relation field (child side of `payment_subscription`); `subscriptionId` mirrors it. */
	subscription: "subscription",
	subscriptionId: "subscription_id",
	purpose: "purpose",
	paymentStatus: "payment_status",
	amount: "amount",
	amountRefunded: "amount_refunded",
	currency: "currency",
	methodType: "method_type",
	failureCode: "failure_code",
	failureMessage: "failure_message",
	stripePaymentIntentId: "stripe_payment_intent_id",
	stripeChargeId: "stripe_charge_id",
	stripeInvoiceId: "stripe_invoice_id",
	paymentCreatedAt: "payment_created_at",
	paymentUpdatedAt: "payment_updated_at",
} as const;

export const SUBSCRIPTION_FIELD = {
	/** Relation fields: child side of `subscription_customer` and of `subscription_initial_order`; payments on the parent side. */
	customer: "customer",
	initialOrder: "initial_order",
	payments: "payments",
	subscriptionStatus: "subscription_status",
	items: "items",
	billingInterval: "billing_interval",
	intervalCount: "interval_count",
	currency: "currency",
	amount: "amount",
	currentPeriodStart: "current_period_start",
	currentPeriodEnd: "current_period_end",
	trialEnd: "trial_end",
	cancelAtPeriodEnd: "cancel_at_period_end",
	canceledAt: "canceled_at",
	stripeSubscriptionId: "stripe_subscription_id",
	stripeCustomerId: "stripe_customer_id",
	latestInvoiceId: "latest_invoice_id",
	providerUpdatedAt: "provider_updated_at",
} as const;

export const CUSTOMER_FIELD = {
	/** Relation fields on the parent side of `order_customer` and `subscription_customer`. */
	orders: "orders",
	subscriptions: "subscriptions",
	email: "email",
	name: "name",
	phone: "phone",
	billingAddress: "billing_address",
	shippingAddress: "shipping_address",
	stripeCustomerId: "stripe_customer_id",
	orderCount: "order_count",
	totalSpent: "total_spent",
	firstOrderAt: "first_order_at",
	lastOrderAt: "last_order_at",
} as const;

export const CART_FIELD = {
	cartId: "cart_id",
	cartStatus: "cart_status",
	email: "email",
	lines: "lines",
	itemCount: "item_count",
	subtotalAmount: "subtotal_amount",
	currency: "currency",
	pricedLines: "priced_lines",
	checkoutSessionId: "checkout_session_id",
	orderId: "order_id",
	country: "country",
	userAgent: "user_agent",
	cartCreatedAt: "cart_created_at",
	lastActivityAt: "last_activity_at",
	expiresAt: "expires_at",
} as const;

export const ORDER_EVENT_FIELD = {
	message: "message",
	eventType: "event_type",
	actorKind: "actor_kind",
	actorLabel: "actor_label",
	data: "data",
	occurredAt: "occurred_at",
	/** Idempotency key (unique). */
	sourceKey: "source_key",
	/** Relation field (child side of `order_timeline`); `orderId` mirrors it as an indexed key for queries. */
	order: "order",
	orderId: "order_id",
} as const;
