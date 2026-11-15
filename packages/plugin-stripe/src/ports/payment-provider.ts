import type { Address } from "../core/customer.js";
import type { CheckoutMode } from "../core/cart.js";
import type { BillingInterval, TaxBehavior } from "../core/catalog.js";
import type { CurrencyCode } from "../core/money.js";
import type { DisputeStatus, PaymentStatus, RefundReason, RefundStatus } from "../core/payment.js";
import type { SubscriptionStatus } from "../core/subscription.js";

/**
 * The payment provider port. Services depend on this interface only; `adapters/stripe` is its one
 * implementation and the only module that imports the `stripe` SDK. Every mutating method takes an
 * idempotency key derived from our own record ids (never random), so a retried call is a no-op.
 * Provider failures surface as `ProviderError` (retryable or not), never as raw SDK errors.
 */

export class ProviderError extends Error {
	readonly isRetryable: boolean;
	readonly providerCode: string | null;

	constructor(message: string, options: { isRetryable: boolean; providerCode?: string | null; cause?: unknown }) {
		super(message, { cause: options.cause });
		this.name = "ProviderError";
		this.isRetryable = options.isRetryable;
		this.providerCode = options.providerCode ?? null;
	}
}

/** Metadata keys the plugin writes on provider objects. Values are short ids, never blobs. */
export const PROVIDER_METADATA = {
	/** `${entity}:${emdashId}` on Products and Prices: adoption and drift detection. */
	entity: "emdash_entity",
	cartId: "emdash_cart_id",
	/** Id of the server-side checkout snapshot; the snapshot itself stays in plugin storage. */
	checkoutId: "emdash_checkout_id",
	pluginId: "emdash_plugin",
} as const;

// --- Catalog -------------------------------------------------------------------------------------

export interface ProviderProductInput {
	/** `product:<id>` or `variant:<id>` — a variant is its own Stripe Product so its name shows on receipts. */
	entityKey: string;
	name: string;
	description: string | null;
	imageUrls: string[];
	isActive: boolean;
	taxCode: string | null;
	extraMetadata: Record<string, string>;
}

export interface ProviderPriceInput {
	entityKey: string;
	providerProductId: string;
	unitAmount: number;
	currency: CurrencyCode;
	recurring: { interval: BillingInterval; intervalCount: number } | null;
	taxBehavior: TaxBehavior;
	nickname: string | null;
	/** Stripe `lookup_key`; transferred to the new price when terms change. */
	lookupKey: string | null;
}

export interface ProviderProductSnapshot {
	providerId: string;
	name: string;
	isActive: boolean;
	entityKey: string | null;
	updatedAt: number;
}

export interface ProviderPriceSnapshot {
	providerId: string;
	providerProductId: string;
	unitAmount: number | null;
	currency: CurrencyCode;
	isActive: boolean;
	entityKey: string | null;
}

export interface CatalogProvider {
	createProduct(input: ProviderProductInput, idempotencyKey: string): Promise<ProviderProductSnapshot>;
	updateProduct(providerId: string, input: ProviderProductInput, idempotencyKey: string): Promise<ProviderProductSnapshot>;
	/** Sets only `active: false` (an entity deleted in EmDash: nothing else is known, nothing else may be cleared). */
	archiveProduct(providerId: string, idempotencyKey: string): Promise<ProviderProductSnapshot>;
	retrieveProduct(providerId: string): Promise<ProviderProductSnapshot | null>;
	/** Finds a product created earlier for this entity (lost mapping) via metadata search. */
	findProductByEntity(entityKey: string): Promise<ProviderProductSnapshot | null>;
	createPrice(input: ProviderPriceInput, idempotencyKey: string): Promise<ProviderPriceSnapshot>;
	/** Only `active`, `nickname` and `lookup_key` are mutable on a provider price. */
	updatePrice(
		providerId: string,
		patch: { isActive?: boolean; nickname?: string | null; lookupKey?: string | null; transferLookupKey?: boolean },
		idempotencyKey: string,
	): Promise<ProviderPriceSnapshot>;
	retrievePrice(providerId: string): Promise<ProviderPriceSnapshot | null>;
}

// --- Checkout -------------------------------------------------------------------------------------

export const CHECKOUT_UI_MODE = {
	hosted: "hosted",
	embedded: "embedded",
} as const;
export type CheckoutUiMode = (typeof CHECKOUT_UI_MODE)[keyof typeof CHECKOUT_UI_MODE];

export interface CheckoutShippingRate {
	displayName: string;
	amount: number;
	currency: CurrencyCode;
	deliveryEstimateDays: { min: number; max: number } | null;
}

/**
 * The provider-neutral part of a checkout request. `CheckoutCustomization` (contracts/extensions.ts)
 * is the subset a site extension may change.
 */
export interface CheckoutSessionInput {
	checkoutId: string;
	cartId: string;
	mode: CheckoutMode;
	uiMode: CheckoutUiMode;
	currency: CurrencyCode;
	lines: Array<{ providerPriceId: string; quantity: number }>;
	customerEmail: string | null;
	providerCustomerId: string | null;
	/** Hosted: success + cancel. Embedded: return only (Stripe redirects there after completion). */
	successUrl: string | null;
	cancelUrl: string | null;
	returnUrl: string | null;
	/** Absolute ISO time; Stripe allows 30 min to 24 h from now. Matches the stock reservation. */
	expiresAt: string;
	locale: string | null;
	allowPromotionCodes: boolean;
	billingAddressCollection: "auto" | "required";
	shippingAddressCountries: string[];
	shippingRates: CheckoutShippingRate[];
	collectPhone: boolean;
	/** Only when the site confirmed an active tax registration (Stripe Tax). */
	automaticTax: boolean;
	trialDays: number | null;
	/** Merged into session metadata under an `ext_` prefix; plugin keys cannot be overwritten. */
	extraMetadata: Record<string, string>;
}

export interface CheckoutSessionResult {
	sessionId: string;
	/** Hosted mode. */
	url: string | null;
	/** Embedded mode. */
	clientSecret: string | null;
	expiresAt: string;
}

export interface ProviderCheckoutLine {
	providerPriceId: string;
	quantity: number;
	description: string;
	amountSubtotal: number;
	amountDiscount: number;
	amountTax: number;
	amountTotal: number;
	currency: CurrencyCode;
}

/** A completed or expired session, retrieved fresh from the provider (never trusted from the event). */
export interface ProviderCheckoutSession {
	sessionId: string;
	status: "open" | "complete" | "expired";
	paymentStatus: "paid" | "unpaid" | "no_payment_required";
	mode: CheckoutMode;
	isLivemode: boolean;
	currency: CurrencyCode;
	amountSubtotal: number;
	amountDiscount: number;
	amountTax: number;
	amountShipping: number;
	amountTotal: number;
	email: string | null;
	name: string | null;
	phone: string | null;
	billingAddress: Address | null;
	shippingAddress: Address | null;
	providerCustomerId: string | null;
	paymentIntentId: string | null;
	subscriptionId: string | null;
	invoiceId: string | null;
	metadata: Record<string, string>;
	lines: ProviderCheckoutLine[];
	createdAt: number;
}

export interface CheckoutProvider {
	createSession(input: CheckoutSessionInput, idempotencyKey: string): Promise<CheckoutSessionResult>;
	retrieveSession(sessionId: string): Promise<ProviderCheckoutSession | null>;
	/** Expires an open session (cart changed while a session was open). Already-closed is not an error. */
	expireSession(sessionId: string): Promise<void>;
}

// --- Payments, refunds, disputes -----------------------------------------------------------------

export interface ProviderPayment {
	paymentIntentId: string;
	status: PaymentStatus;
	amount: number;
	amountRefunded: number;
	currency: CurrencyCode;
	latestChargeId: string | null;
	methodType: string | null;
	failureCode: string | null;
	failureMessage: string | null;
	metadata: Record<string, string>;
}

export interface ProviderRefund {
	refundId: string;
	paymentIntentId: string | null;
	chargeId: string | null;
	amount: number;
	currency: CurrencyCode;
	status: RefundStatus;
	reason: string | null;
	/** Our refund record id, echoed from metadata; null for refunds made in the Stripe dashboard. */
	refundRecordId: string | null;
}

export interface ProviderDispute {
	disputeId: string;
	chargeId: string;
	paymentIntentId: string | null;
	amount: number;
	currency: CurrencyCode;
	status: DisputeStatus;
	reason: string | null;
}

export interface PaymentsProvider {
	retrievePayment(paymentIntentId: string): Promise<ProviderPayment | null>;
	createRefund(
		input: { paymentIntentId: string; amount: number; reason: RefundReason | null; refundRecordId: string },
		idempotencyKey: string,
	): Promise<ProviderRefund>;
}

// --- Customers and subscriptions -----------------------------------------------------------------

export interface ProviderCustomer {
	providerCustomerId: string;
	email: string | null;
	name: string | null;
	phone: string | null;
	billingAddress: Address | null;
	shippingAddress: Address | null;
	isDeleted: boolean;
}

export interface ProviderSubscription {
	subscriptionId: string;
	providerCustomerId: string;
	status: SubscriptionStatus;
	items: Array<{ providerPriceId: string; quantity: number; description: string | null }>;
	interval: BillingInterval;
	intervalCount: number;
	currency: CurrencyCode;
	amount: number;
	currentPeriodStart: number | null;
	currentPeriodEnd: number | null;
	trialEnd: number | null;
	cancelAtPeriodEnd: boolean;
	canceledAt: number | null;
	latestInvoiceId: string | null;
	metadata: Record<string, string>;
}

export interface ProviderInvoice {
	invoiceId: string;
	subscriptionId: string | null;
	providerCustomerId: string | null;
	paymentIntentId: string | null;
	chargeId: string | null;
	status: "draft" | "open" | "paid" | "uncollectible" | "void";
	billingReason: string | null;
	amountPaid: number;
	amountDue: number;
	currency: CurrencyCode;
	attemptCount: number;
}

export interface CustomersProvider {
	/** Creates a provider customer for our customer record; idempotent on `customerRecordId`. */
	createCustomer(
		input: { customerRecordId: string; email: string; name: string | null; phone: string | null },
		idempotencyKey: string,
	): Promise<ProviderCustomer>;
	retrieveCustomer(providerCustomerId: string): Promise<ProviderCustomer | null>;
	/** Requires the Customer Portal to be configured in the Stripe dashboard (test and live separately). */
	createPortalSession(input: { providerCustomerId: string; returnUrl: string }): Promise<{ url: string }>;
}

export interface SubscriptionsProvider {
	retrieveSubscription(subscriptionId: string): Promise<ProviderSubscription | null>;
	cancelSubscription(
		subscriptionId: string,
		options: { atPeriodEnd: boolean },
		idempotencyKey: string,
	): Promise<ProviderSubscription>;
	retrieveInvoice(invoiceId: string): Promise<ProviderInvoice | null>;
}

// --- Webhooks ------------------------------------------------------------------------------------

/**
 * Normalised webhook actions (the Medusa idea): handlers switch on `action.kind`, never on raw Stripe
 * event names. Objects in an action are the event's snapshot; handlers that need current state
 * retrieve it (settlement always retrieves the session).
 */
export type WebhookAction =
	| { kind: "checkout_completed"; sessionId: string }
	| { kind: "checkout_async_succeeded"; sessionId: string }
	| { kind: "checkout_async_failed"; sessionId: string }
	| { kind: "checkout_expired"; sessionId: string }
	| { kind: "payment_updated"; payment: ProviderPayment }
	| { kind: "refund_updated"; refund: ProviderRefund }
	| { kind: "dispute_updated"; dispute: ProviderDispute }
	| { kind: "customer_updated"; customer: ProviderCustomer }
	| { kind: "subscription_updated"; subscription: ProviderSubscription }
	| { kind: "subscription_trial_will_end"; subscriptionId: string; trialEnd: number }
	| { kind: "invoice_paid"; invoice: ProviderInvoice }
	| { kind: "invoice_payment_failed"; invoice: ProviderInvoice }
	| { kind: "product_changed"; product: ProviderProductSnapshot }
	| { kind: "price_changed"; price: ProviderPriceSnapshot }
	| { kind: "unsupported" };

export interface ProviderWebhookEvent {
	eventId: string;
	/** Raw provider event type, e.g. "checkout.session.completed". */
	type: string;
	/** Provider timestamp (seconds); orders updates on the same object. */
	created: number;
	isLivemode: boolean;
	action: WebhookAction;
	/** The verified raw event, handed to site `stripeWebhooks` extensions unchanged. */
	raw: unknown;
}

export interface WebhookEndpointInfo {
	endpointId: string;
	url: string;
	enabledEvents: string[];
	status: string;
}

export interface WebhooksProvider {
	/** Verifies the signature on the exact raw body; throws `WebhookSignatureError` when invalid. */
	verifyAndParse(rawBody: string, signature: string | null): Promise<ProviderWebhookEvent>;
	/** Events after `createdAfter` (seconds), oldest first — reconciliation after missed deliveries. */
	listEventsSince(createdAfter: number, types: readonly string[]): AsyncIterable<ProviderWebhookEvent>;
	listEndpoints(): Promise<WebhookEndpointInfo[]>;
	/** Returns the signing secret only on creation. */
	createEndpoint(input: { url: string; events: readonly string[] }, idempotencyKey: string): Promise<WebhookEndpointInfo & { secret: string | null }>;
	updateEndpoint(endpointId: string, input: { events: readonly string[] }): Promise<WebhookEndpointInfo>;
}

export class WebhookSignatureError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "WebhookSignatureError";
	}
}

export interface ProviderAccountInfo {
	accountId: string;
	isLivemode: boolean;
	apiVersion: string;
	/** "rk_" restricted key (recommended), "sk_" secret key. */
	keyKind: "restricted" | "secret" | "unknown";
	displayName: string | null;
}

export interface PaymentProvider {
	readonly id: "stripe";
	readonly catalog: CatalogProvider;
	readonly checkout: CheckoutProvider;
	readonly payments: PaymentsProvider;
	readonly customers: CustomersProvider;
	readonly subscriptions: SubscriptionsProvider;
	readonly webhooks: WebhooksProvider;
	describeAccount(): Promise<ProviderAccountInfo>;
}
