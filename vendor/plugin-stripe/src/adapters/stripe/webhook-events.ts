import type Stripe from "stripe";

import type { ProviderWebhookEvent, WebhookAction } from "../../ports/payment-provider.js";
import { toPriceSnapshot, toProductSnapshot } from "./mappers/catalog-snapshots.js";
import { toProviderCustomer } from "./mappers/customer.js";
import { toProviderDispute, toProviderPayment, toProviderRefund } from "./mappers/payment.js";
import { toProviderInvoice, toProviderSubscription } from "./mappers/subscription.js";

/**
 * Every Stripe event type the plugin handles: the endpoint is registered for exactly these and
 * reconciliation (`events.list`) filters on them. `toWebhookAction` must map each one to a kind other than
 * "unsupported" (a test walks this list).
 */
export const WEBHOOK_EVENT_TYPES: readonly string[] = [
	"checkout.session.completed",
	"checkout.session.async_payment_succeeded",
	"checkout.session.async_payment_failed",
	"checkout.session.expired",
	"payment_intent.succeeded",
	"payment_intent.payment_failed",
	"payment_intent.processing",
	"payment_intent.requires_action",
	"payment_intent.canceled",
	"refund.created",
	"refund.updated",
	"refund.failed",
	"charge.dispute.created",
	"charge.dispute.updated",
	"charge.dispute.closed",
	"charge.dispute.funds_withdrawn",
	"charge.dispute.funds_reinstated",
	"customer.created",
	"customer.updated",
	"customer.deleted",
	"customer.subscription.created",
	"customer.subscription.updated",
	"customer.subscription.deleted",
	"customer.subscription.paused",
	"customer.subscription.resumed",
	"customer.subscription.trial_will_end",
	"invoice.paid",
	"invoice.payment_failed",
	"product.created",
	"product.updated",
	"product.deleted",
	"price.created",
	"price.updated",
	"price.deleted",
];

const UNSUPPORTED: WebhookAction = { kind: "unsupported" };

/**
 * Normalises a verified event. Objects in an action are the event's snapshot (the object as it was when the
 * event fired); handlers that need current state retrieve it. Notably, an invoice here carries no payment
 * links (`payments` is not expanded in events), so `retrieveInvoice` is how the PaymentIntent is found.
 */
export const toWebhookAction = (event: Stripe.Event): WebhookAction => {
	switch (event.type) {
		case "checkout.session.completed":
			return { kind: "checkout_completed", sessionId: event.data.object.id };
		case "checkout.session.async_payment_succeeded":
			return { kind: "checkout_async_succeeded", sessionId: event.data.object.id };
		case "checkout.session.async_payment_failed":
			return { kind: "checkout_async_failed", sessionId: event.data.object.id };
		case "checkout.session.expired":
			return { kind: "checkout_expired", sessionId: event.data.object.id };

		case "payment_intent.succeeded":
		case "payment_intent.processing":
		case "payment_intent.requires_action":
		case "payment_intent.canceled":
			return { kind: "payment_updated", payment: toProviderPayment(event.data.object) };
		case "payment_intent.payment_failed":
			return { kind: "payment_updated", payment: toProviderPayment(event.data.object, { forceFailed: true }) };

		case "refund.created":
		case "refund.updated":
		case "refund.failed":
			return { kind: "refund_updated", refund: toProviderRefund(event.data.object) };

		case "charge.dispute.created":
		case "charge.dispute.updated":
		case "charge.dispute.closed":
		case "charge.dispute.funds_withdrawn":
		case "charge.dispute.funds_reinstated":
			return { kind: "dispute_updated", dispute: toProviderDispute(event.data.object) };

		case "customer.created":
		case "customer.updated":
			return { kind: "customer_updated", customer: toProviderCustomer(event.data.object) };
		// The deleted event carries the last known customer; the flag is what matters.
		case "customer.deleted":
			return { kind: "customer_updated", customer: { ...toProviderCustomer(event.data.object), isDeleted: true } };

		case "customer.subscription.created":
		case "customer.subscription.updated":
		case "customer.subscription.deleted":
		case "customer.subscription.paused":
		case "customer.subscription.resumed":
			return { kind: "subscription_updated", subscription: toProviderSubscription(event.data.object) };
		case "customer.subscription.trial_will_end":
			return {
				kind: "subscription_trial_will_end",
				subscriptionId: event.data.object.id,
				trialEnd: event.data.object.trial_end ?? event.created,
			};

		case "invoice.paid":
			return { kind: "invoice_paid", invoice: toProviderInvoice(event.data.object) };
		case "invoice.payment_failed":
			return { kind: "invoice_payment_failed", invoice: toProviderInvoice(event.data.object) };

		case "product.created":
		case "product.updated":
			return { kind: "product_changed", product: toProductSnapshot(event.data.object) };
		case "product.deleted":
			return { kind: "product_changed", product: toProductSnapshot(event.data.object, { isDeleted: true }) };
		case "price.created":
		case "price.updated":
			return { kind: "price_changed", price: toPriceSnapshot(event.data.object) };
		case "price.deleted":
			return { kind: "price_changed", price: toPriceSnapshot(event.data.object, { isDeleted: true }) };

		default:
			return UNSUPPORTED;
	}
};

export interface UnmappableEventInfo {
	eventId: string;
	type: string;
	reason: string;
}

export interface WebhookEventOptions {
	/** Told why an event was reduced to `unsupported`; defaults to a `console.warn` (ids and the reason only). */
	onUnmappable?: (info: UnmappableEventInfo) => void;
}

const warnUnmappable = (info: UnmappableEventInfo): void => {
	console.warn("[stripe-commerce] Stripe event could not be mapped and is treated as unsupported", info);
};

/**
 * A verified event whose object cannot be mapped (a subscription with no recurring item, an unknown currency)
 * becomes `unsupported` with the raw event intact. Throwing instead would make the webhook route fail the same
 * way on every retry, for three days, over an event that can never be handled; the inbox keeps it for audit.
 */
export const toProviderWebhookEvent = (event: Stripe.Event, options: WebhookEventOptions = {}): ProviderWebhookEvent => {
	let action: WebhookAction;
	try {
		action = toWebhookAction(event);
	} catch (error) {
		action = UNSUPPORTED;
		(options.onUnmappable ?? warnUnmappable)({
			eventId: event.id,
			type: event.type,
			reason: error instanceof Error ? error.message : "unknown mapping error",
		});
	}
	return { eventId: event.id, type: event.type, created: event.created, isLivemode: event.livemode, action, raw: event };
};
