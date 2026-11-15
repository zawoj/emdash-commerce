import type { SellableRef } from "./catalog.js";
import type { FulfillmentStatus, OrderLifecycleStatus, OrderPaymentStatus, ReviewFlag } from "./order.js";
import type { SubscriptionStatus } from "./subscription.js";

/**
 * Domain events: the public, provider-neutral extension surface. EmDash has no event bus, so they
 * are written to a durable outbox in plugin storage in the same step that changes state, then
 * delivered to each subscriber (built-in and site extensions) with at-least-once semantics and
 * retries from cron. Subscribers must be idempotent on `event.id`.
 *
 * Payloads carry ids and small facts only; a subscriber that needs the full record loads it
 * through the read API in its context. Adding a field is backward compatible; renaming or
 * removing one is a breaking change of this package.
 */

export interface CommerceEventPayloads {
	"order.created": {
		orderId: string;
		orderNumber: string;
		/** @deprecated The payment status under its former name; read `paymentStatus`. */
		status: OrderPaymentStatus;
		paymentStatus: OrderPaymentStatus;
		orderStatus: OrderLifecycleStatus;
	};
	"order.paid": { orderId: string; orderNumber: string; amount: number; currency: string };
	"order.payment_failed": { orderId: string; orderNumber: string; failureCode: string | null };
	"order.refunded": {
		orderId: string;
		orderNumber: string;
		refundId: string;
		amount: number;
		amountRefundedTotal: number;
		isFullyRefunded: boolean;
	};
	"order.disputed": { orderId: string; orderNumber: string; amount: number; reason: string | null };
	"order.dispute_closed": { orderId: string; orderNumber: string; outcome: "won" | "lost" };
	"order.cancelled": { orderId: string; orderNumber: string };
	"order.completed": { orderId: string; orderNumber: string };
	"order.archived": { orderId: string; orderNumber: string };
	"order.reopened": { orderId: string; orderNumber: string; previousStatus: OrderLifecycleStatus };
	"order.fulfillment_changed": { orderId: string; orderNumber: string; fulfillmentStatus: FulfillmentStatus; previousStatus: FulfillmentStatus };
	"order.needs_review": { orderId: string; orderNumber: string; flags: ReviewFlag[] };
	"subscription.created": { subscriptionId: string; customerId: string | null; status: SubscriptionStatus };
	"subscription.updated": {
		subscriptionId: string;
		status: SubscriptionStatus;
		previousStatus: SubscriptionStatus | null;
		cancelAtPeriodEnd: boolean;
	};
	"subscription.canceled": { subscriptionId: string; customerId: string | null };
	"subscription.trial_will_end": { subscriptionId: string; trialEnd: string };
	"invoice.paid": { subscriptionId: string; paymentId: string; amount: number; currency: string };
	"invoice.payment_failed": { subscriptionId: string; amount: number; currency: string; attemptCount: number };
	"customer.created": { customerId: string; email: string };
	"customer.updated": { customerId: string };
	"cart.converted": { cartId: string; orderId: string };
	"cart.abandoned": { cartId: string; email: string | null; itemCount: number };
	"inventory.low_stock": { sellable: SellableRef; available: number; threshold: number };
	"inventory.out_of_stock": { sellable: SellableRef };
	"catalog.sync_failed": { entity: "product" | "variant" | "price"; id: string; error: string };
	"catalog.drift_detected": { entity: "product" | "price"; id: string; stripeId: string; fields: string[] };
}

export type CommerceEventType = keyof CommerceEventPayloads;

export interface CommerceEvent<T extends CommerceEventType = CommerceEventType> {
	/** Deterministic where possible (`${type}:${sourceId}`) so a replayed webhook emits the same id. */
	id: string;
	type: T;
	occurredAt: string;
	data: CommerceEventPayloads[T];
}

export type AnyCommerceEvent = { [T in CommerceEventType]: CommerceEvent<T> }[CommerceEventType];

export const commerceEventId = (type: CommerceEventType, sourceId: string): string => `${type}:${sourceId}`;
