import type { Cart } from "../core/cart.js";
import type { Price, Product, SellableRef, Variant } from "../core/catalog.js";
import type { Customer } from "../core/customer.js";
import type { AnyCommerceEvent } from "../core/events.js";
import type { Attribute, AttributeValue, Brand, Category, ProductType } from "../core/product-type.js";
import type { Reservation, ReservationLine, ReserveResult, StockLevel } from "../core/inventory.js";
import type { Order, OrderLifecycleStatus, OrderPaymentStatus } from "../core/order.js";
import type { OrderTimelineEvent } from "../core/order-timeline.js";
import type { Payment, Refund } from "../core/payment.js";
import type { IdGenerator } from "../core/ids.js";
import type { Subscription } from "../core/subscription.js";
import type { ProviderWebhookEvent } from "./payment-provider.js";

/**
 * Persistence ports. `adapters/emdash` implements them on EmDash content collections (records an
 * editor sees) and plugin storage (machine state that needs atomic updates or indexes the content
 * API cannot query). `testing/` implements them in memory with the same semantics, including
 * compare-and-set conflicts, so service tests exercise the real concurrency rules.
 *
 * Rules shared by every implementation:
 * - Reads return `null` for a missing record, never throw.
 * - `Versioned<T>` writes fail with `{ applied: false }` on a stale revision; callers re-read and retry.
 * - No implementation calls the payment provider.
 */

export interface Versioned<T> {
	value: T;
	revision: string;
}

export type CasResult = { applied: true; revision: string } | { applied: false };

export interface Page<T> {
	items: T[];
	cursor: string | null;
}

// --- Catalog (content, read-mostly) ---------------------------------------------------------------

export interface CatalogRepository {
	getProduct(id: string): Promise<Product | null>;
	getProductBySlug(slug: string): Promise<Product | null>;
	getVariant(id: string): Promise<Variant | null>;
	listVariants(productId: string): Promise<Variant[]>;
	getPrice(id: string): Promise<Price | null>;
	getPrices(ids: readonly string[]): Promise<Map<string, Price>>;
	listPrices(productId: string): Promise<Price[]>;
	listProducts(cursor: string | null, limit: number): Promise<Page<Product>>;
	/** Product-model vocabulary (links read through `RelationsPort`; a bounded relation with more than 50 links throws `CATALOG_LIMIT_EXCEEDED`). */
	getProductType(id: string): Promise<ProductType | null>;
	/** The attribute with its ordered values. */
	getAttribute(id: string): Promise<Attribute | null>;
	getAttributeValues(ids: readonly string[]): Promise<Map<string, AttributeValue>>;
	getBrand(id: string): Promise<Brand | null>;
	getCategory(id: string): Promise<Category | null>;
}

/**
 * What the plugin last wrote to the provider for one entity. A provider snapshot equal to this is our own
 * write echoing back through a webhook; a difference is drift. Products and variants carry `name` and
 * `isActive`; prices carry `isActive`, `unitAmount` and `currency`.
 */
export interface CatalogLastWritten {
	name?: string;
	isActive?: boolean;
	unitAmount?: number;
	currency?: string;
}

/** Stripe ids and sync state per catalog entity, keyed by entity key (`product:<id>`, `price:<id>`). */
export interface CatalogLink {
	entityKey: string;
	providerId: string | null;
	/** Prices: provider price per terms fingerprint, so reverting a price reuses the old Stripe price. */
	providerPriceByFingerprint: Record<string, string>;
	fingerprint: string | null;
	syncStatus: "pending" | "synced" | "failed";
	lastError: string | null;
	attempts: number;
	nextAttemptAt: string | null;
	syncedAt: string | null;
	driftFields: string[];
	/**
	 * Monotonic counter bumped whenever the desired state of the entity changes (hook, resync, terms change).
	 * It is part of every update/archive/reactivate idempotency key: Stripe replays the cached response of a
	 * key for 24 h, so the same payload sent for a later, distinct intent needs a different key. Retries of
	 * one attempt keep the version. Optional so links stored before it existed stay valid (read as 0).
	 */
	syncVersion?: number;
	/** Hash of the payload last written successfully; an attempt with the same desired hash makes no provider call. */
	lastWrittenHash?: string | null;
	lastWritten?: CatalogLastWritten | null;
}

export interface CatalogLinkStore {
	get(entityKey: string): Promise<Versioned<CatalogLink> | null>;
	put(link: CatalogLink, expectedRevision: string | null): Promise<CasResult>;
	findByProviderId(providerId: string): Promise<CatalogLink | null>;
	listDue(now: string, limit: number): Promise<CatalogLink[]>;
	listFailed(limit: number): Promise<CatalogLink[]>;
}

// --- Carts and checkout ---------------------------------------------------------------------------

export interface CartStore {
	get(cartId: string): Promise<Versioned<Cart> | null>;
	put(cart: Cart, expectedRevision: string | null): Promise<CasResult>;
	delete(cartId: string): Promise<void>;
	listExpiringBefore(isoTime: string, limit: number): Promise<Cart[]>;
	listByStatus(status: Cart["status"], updatedBefore: string, limit: number): Promise<Cart[]>;
}

/** Admin-visible mirror of a cart in the `carts` content collection; best effort, never authoritative. */
export interface CartMirror {
	upsert(cart: Cart, summary: { itemCount: number; subtotal: number | null; currency: string | null; lines: unknown[] }): Promise<void>;
}

/** Server-side truth about what a Checkout Session was created for; settlement compares against it. */
export interface CheckoutSnapshot {
	checkoutId: string;
	cartId: string;
	sessionId: string | null;
	mode: "payment" | "subscription";
	currency: string;
	lines: Array<{ priceId: string; providerPriceId: string; quantity: number; unitAmount: number }>;
	expectedSubtotal: number;
	reservationId: string | null;
	customerId: string | null;
	createdAt: string;
	/**
	 * Checkout service only (optional, so snapshots written before they existed stay valid): what a repeated
	 * checkout request needs to hand back the same open session instead of creating a second one.
	 * `clientSecret` is the embedded-checkout secret, which the provider's retrieve call does not expose; it
	 * is stored with the snapshot (server-side storage, never logged) and returned only to the buyer who
	 * holds the cart id.
	 */
	uiMode?: "hosted" | "embedded";
	sessionUrl?: string | null;
	clientSecret?: string | null;
	expiresAt?: string;
}

export interface CheckoutSnapshotStore {
	get(checkoutId: string): Promise<CheckoutSnapshot | null>;
	getBySession(sessionId: string): Promise<CheckoutSnapshot | null>;
	put(snapshot: CheckoutSnapshot): Promise<void>;
}

// --- Inventory (storage, atomic) ------------------------------------------------------------------

export interface InventoryStore {
	get(sellable: SellableRef): Promise<StockLevel | null>;
	getMany(sellables: readonly SellableRef[]): Promise<Map<string, StockLevel>>;
	/**
	 * Holds every line or none: lines are reserved one by one with guarded `updateIf`, and the ones
	 * already taken are released when a later one fails. Untracked or backorderable sellables are
	 * passed by the caller with `isGuarded: false`.
	 */
	reserve(
		input: { reservationId: string; cartId: string; lines: Array<ReservationLine & { isGuarded: boolean }>; expiresAt: string },
	): Promise<ReserveResult>;
	/** Idempotent: a reservation commits or releases at most once. */
	commit(reservationId: string): Promise<Reservation | null>;
	release(reservationId: string): Promise<Reservation | null>;
	getReservation(reservationId: string): Promise<Reservation | null>;
	listExpiredReservations(now: string, limit: number): Promise<Reservation[]>;
	/** Adds `delta` to onHand and available; creates the level when missing. */
	adjust(sellable: SellableRef, delta: number, reason: string): Promise<StockLevel>;
	setMirroredOnHand(sellable: SellableRef, onHand: number): Promise<void>;
}

// --- Orders, payments, refunds, subscriptions, customers (content) --------------------------------

/**
 * Secondary keys the content API cannot query (plugin storage). `claim` is the exactly-once gate:
 * the first caller for a key wins, later callers see the winner's record id.
 */
export interface RecordIndex {
	get(key: string): Promise<string | null>;
	claim(key: string): Promise<{ isWinner: true } | { isWinner: false; recordId: string | null }>;
	set(key: string, recordId: string): Promise<void>;
	releaseClaim(key: string): Promise<void>;
}

export const RECORD_INDEX_KEY = {
	orderBySession: (sessionId: string): string => `order:session:${sessionId}`,
	orderByPaymentIntent: (paymentIntentId: string): string => `order:pi:${paymentIntentId}`,
	orderByNumber: (orderNumber: string): string => `order:number:${orderNumber}`,
	orderBySubscription: (subscriptionId: string): string => `order:sub:${subscriptionId}`,
	paymentByPaymentIntent: (paymentIntentId: string): string => `payment:pi:${paymentIntentId}`,
	paymentByInvoice: (invoiceId: string): string => `payment:invoice:${invoiceId}`,
	paymentByCharge: (chargeId: string): string => `payment:charge:${chargeId}`,
	refundByProviderId: (refundId: string): string => `refund:stripe:${refundId}`,
	subscriptionByProviderId: (subscriptionId: string): string => `subscription:stripe:${subscriptionId}`,
	customerByEmail: (email: string): string => `customer:email:${email}`,
	customerByProviderId: (providerCustomerId: string): string => `customer:stripe:${providerCustomerId}`,
	/** The timeline entry of one occurrence (exactly-once gate of `recordOrderEvent`). */
	orderEventBySource: (sourceKey: string): string => `orderevent:${sourceKey}`,
	/** Admin mirror entry of a cart (content id), so concurrent upserts cannot create two. */
	cartMirrorByCart: (cartId: string): string => `cartmirror:${cartId}`,
} as const;

export interface OrderRepository {
	create(order: Omit<Order, "id">): Promise<Order>;
	get(id: string): Promise<Order | null>;
	/** Plugin-owned write: bypasses the read-only field guard. */
	update(id: string, patch: Partial<Omit<Order, "id">>): Promise<Order>;
	/** Newest first. `status` filters the payment axis, `orderStatus` the lifecycle axis. */
	list(input: { status?: OrderPaymentStatus; orderStatus?: OrderLifecycleStatus; cursor: string | null; limit: number }): Promise<Page<Order>>;
	/** The order of a Checkout Session, through the indexed session id (never a scan). */
	findByCheckoutSession(sessionId: string): Promise<Order | null>;
	/**
	 * The next value (1, 2, 3, …) of the order number counter of `year`. Atomic: concurrent callers never get the
	 * same value. A value whose order was never created leaves a gap (the counter is not rolled back).
	 */
	nextSequence(year: number): Promise<number>;
	/** The order timeline (its own collection, shown inside the order). */
	events: OrderEventRepository;
}

/** Append-only log of what happened to an order. The only writer is `recordOrderEvent` (services/order-events.ts). */
export interface OrderEventRepository {
	/**
	 * Skips a `sourceKey` that is already stored (`isNew: false`). That check is not atomic (EmDash's `unique` flag on
	 * a content field is metadata, not a database constraint), so concurrent writers are serialised by the claim in
	 * `recordOrderEvent`, which is the only caller.
	 */
	create(event: Omit<OrderTimelineEvent, "id">): Promise<{ event: OrderTimelineEvent; isNew: boolean }>;
	/** Newest first, through the indexed order id. */
	listByOrder(orderId: string, input: { cursor: string | null; limit: number }): Promise<Page<OrderTimelineEvent>>;
}

export interface PaymentRepository {
	create(payment: Omit<Payment, "id">): Promise<Payment>;
	get(id: string): Promise<Payment | null>;
	update(id: string, patch: Partial<Omit<Payment, "id">>): Promise<Payment>;
	listByOrder(orderId: string): Promise<Payment[]>;
}

/** Refunds live in plugin storage (machine state); their summary is projected onto order and payment. */
export interface RefundStore {
	get(id: string): Promise<Refund | null>;
	put(refund: Refund): Promise<void>;
	listByOrder(orderId: string): Promise<Refund[]>;
}

export interface SubscriptionRepository {
	create(subscription: Omit<Subscription, "id">): Promise<Subscription>;
	get(id: string): Promise<Subscription | null>;
	update(id: string, patch: Partial<Omit<Subscription, "id">>): Promise<Subscription>;
}

export interface CustomerRepository {
	create(customer: Omit<Customer, "id">): Promise<Customer>;
	get(id: string): Promise<Customer | null>;
	update(id: string, patch: Partial<Omit<Customer, "id">>): Promise<Customer>;
}

// --- Webhook inbox and domain-event outbox (storage) ----------------------------------------------

export const INBOX_STATUS = {
	received: "received",
	processing: "processing",
	processed: "processed",
	failed: "failed",
	/** Gave up after the maximum attempts; only a manual replay runs it again. */
	dead: "dead",
	/** Verified but not ours (unsupported type, foreign session) — kept for audit. */
	ignored: "ignored",
} as const;
export type InboxStatus = (typeof INBOX_STATUS)[keyof typeof INBOX_STATUS];

export interface InboxRecord {
	eventId: string;
	type: string;
	created: number;
	isLivemode: boolean;
	status: InboxStatus;
	attempts: number;
	lastError: string | null;
	nextAttemptAt: string | null;
	receivedAt: string;
	processedAt: string | null;
	/** Verified raw event JSON, kept so failed events can be retried without asking Stripe again. */
	payload: string;
	source: "webhook" | "reconcile" | "replay";
}

export interface WebhookInbox {
	/** Records a verified event once (unique on eventId); returns the existing record on a repeat. */
	record(event: ProviderWebhookEvent, payload: string, source: InboxRecord["source"]): Promise<{ isNew: boolean; record: InboxRecord }>;
	/** Takes the processing lease; false when another worker holds a fresh lease or it is done. */
	claim(eventId: string, leaseMs: number): Promise<boolean>;
	markProcessed(eventId: string): Promise<void>;
	markIgnored(eventId: string, reason: string): Promise<void>;
	/** A null `nextAttemptAt` gives up: the event becomes `dead` and only a replay runs it again. */
	markFailed(eventId: string, error: string, nextAttemptAt: string | null): Promise<InboxRecord>;
	/**
	 * Manual replay: resets a stored event (any final or failed status, attempts back to 0) so it is due
	 * immediately. False when it does not exist or is being processed under a live lease.
	 */
	requeue(eventId: string): Promise<boolean>;
	get(eventId: string): Promise<InboxRecord | null>;
	listDue(now: string, limit: number): Promise<InboxRecord[]>;
	listByStatus(status: InboxStatus, limit: number, cursor: string | null): Promise<Page<InboxRecord>>;
	/** Latest provider `created` seen; reconciliation lists events after it. */
	getCursor(): Promise<number | null>;
	setCursor(created: number): Promise<void>;
	/**
	 * Housekeeping: deletes finished (`processed` or `ignored`) events received before `before` (ISO time),
	 * at most `limit` per call. Failed and dead events are never purged: they are an operator's to-do list.
	 */
	purgeFinished(before: string, limit: number): Promise<number>;
}

export interface OutboxRecord {
	event: AnyCommerceEvent;
	/** Per-subscriber delivery state; a subscriber id is stable across deploys. */
	deliveries: Record<string, { status: "pending" | "delivered" | "failed" | "dead"; attempts: number; lastError: string | null; nextAttemptAt: string | null }>;
	createdAt: string;
}

export interface EventOutbox {
	/** Idempotent on event id: re-enqueueing an existing event is a no-op. */
	enqueue(events: readonly AnyCommerceEvent[], subscriberIds: readonly string[]): Promise<void>;
	get(eventId: string): Promise<Versioned<OutboxRecord> | null>;
	update(record: OutboxRecord, expectedRevision: string): Promise<CasResult>;
	listDue(now: string, limit: number): Promise<OutboxRecord[]>;
	listDead(limit: number): Promise<OutboxRecord[]>;
	/**
	 * Housekeeping: deletes events created before `before` (ISO time) whose every delivery succeeded, at
	 * most `limit` per call. An event with a pending, failed or dead delivery is kept.
	 */
	purgeDelivered(before: string, limit: number): Promise<number>;
}

// --- Cross-cutting --------------------------------------------------------------------------------

export interface RateLimiter {
	/** Fixed window; returns false when `key` exceeded `limit` within `windowMs`. */
	hit(key: string, limit: number, windowMs: number): Promise<boolean>;
	/** Housekeeping: deletes the counters of windows that already ended, at most `limit` per call. */
	purgeExpired(limit: number): Promise<number>;
}

export interface Clock {
	now(): Date;
}

export type { IdGenerator };

export interface Logger {
	debug(message: string, meta?: Record<string, unknown>): void;
	info(message: string, meta?: Record<string, unknown>): void;
	warn(message: string, meta?: Record<string, unknown>): void;
	error(message: string, meta?: Record<string, unknown>): void;
}

export interface Mailer {
	/**
	 * Resolves false when no email provider is configured (a configuration state, not retried). A provider that is
	 * configured but fails to deliver throws, so an outbox subscriber is retried instead of losing the email.
	 */
	send(message: { to: string; subject: string; text: string; html: string | null }): Promise<boolean>;
}
