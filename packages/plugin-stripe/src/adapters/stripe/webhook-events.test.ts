import type Stripe from "stripe";
import { describe, expect, it } from "vitest";

import { STRIPE_FIXTURE_EVENT_TYPES, loadStripeEvent, type StripeFixtureEventType } from "../../testing/fixtures/stripe/index.js";
import type { WebhookAction } from "../../ports/payment-provider.js";
import { WEBHOOK_EVENT_TYPES, toProviderWebhookEvent, toWebhookAction } from "./webhook-events.js";

const action = (type: StripeFixtureEventType): WebhookAction => toWebhookAction(loadStripeEvent(type));

type Kind = WebhookAction["kind"];

const EXPECTED_KIND: Record<StripeFixtureEventType, Kind> = {
	"checkout.session.completed": "checkout_completed",
	"checkout.session.async_payment_succeeded": "checkout_async_succeeded",
	"checkout.session.async_payment_failed": "checkout_async_failed",
	"checkout.session.expired": "checkout_expired",
	"payment_intent.succeeded": "payment_updated",
	"payment_intent.payment_failed": "payment_updated",
	"payment_intent.processing": "payment_updated",
	"payment_intent.requires_action": "payment_updated",
	"payment_intent.canceled": "payment_updated",
	"refund.created": "refund_updated",
	"refund.updated": "refund_updated",
	"refund.failed": "refund_updated",
	"charge.dispute.created": "dispute_updated",
	"charge.dispute.updated": "dispute_updated",
	"charge.dispute.closed": "dispute_updated",
	"charge.dispute.funds_withdrawn": "dispute_updated",
	"charge.dispute.funds_reinstated": "dispute_updated",
	"customer.created": "customer_updated",
	"customer.updated": "customer_updated",
	"customer.deleted": "customer_updated",
	"customer.subscription.created": "subscription_updated",
	"customer.subscription.updated": "subscription_updated",
	"customer.subscription.deleted": "subscription_updated",
	"customer.subscription.paused": "subscription_updated",
	"customer.subscription.resumed": "subscription_updated",
	"customer.subscription.trial_will_end": "subscription_trial_will_end",
	"invoice.paid": "invoice_paid",
	"invoice.payment_failed": "invoice_payment_failed",
	"product.created": "product_changed",
	"product.updated": "product_changed",
	"product.deleted": "product_changed",
	"price.created": "price_changed",
	"price.updated": "price_changed",
	"price.deleted": "price_changed",
};

describe("webhook event catalogue", () => {
	it("has a fixture for exactly the subscribed event types", () => {
		expect([...WEBHOOK_EVENT_TYPES].sort()).toEqual([...STRIPE_FIXTURE_EVENT_TYPES].sort());
	});

	it("lists every type once", () => {
		expect(new Set(WEBHOOK_EVENT_TYPES).size).toBe(WEBHOOK_EVENT_TYPES.length);
	});

	it.each(STRIPE_FIXTURE_EVENT_TYPES)("normalises %s", (type) => {
		const event = loadStripeEvent(type);
		expect(event.type).toBe(type);
		const result = toProviderWebhookEvent(event);
		expect(result.action.kind).toBe(EXPECTED_KIND[type]);
		expect(result).toMatchObject({ eventId: event.id, type, created: event.created, isLivemode: false });
		expect(result.raw).toBe(event);
	});

	it("never reports a subscribed type as unsupported", () => {
		for (const type of WEBHOOK_EVENT_TYPES) {
			expect(action(type as StripeFixtureEventType).kind).not.toBe("unsupported");
		}
	});

	it("marks anything else as unsupported", () => {
		const event = { ...loadStripeEvent("customer.created"), type: "charge.succeeded" } as unknown as Stripe.Event;
		expect(toWebhookAction(event)).toEqual({ kind: "unsupported" });
	});
});

describe("webhook action details", () => {
	it("carries the session id for checkout events", () => {
		const event = loadStripeEvent("checkout.session.completed");
		expect(action("checkout.session.completed")).toEqual({ kind: "checkout_completed", sessionId: (event.data.object as Stripe.Checkout.Session).id });
	});

	it("reports a payment failure as failed even though the intent is back to requires_payment_method", () => {
		const result = action("payment_intent.payment_failed");
		expect(result).toMatchObject({ kind: "payment_updated", payment: { status: "failed" } });
	});

	it("reports a payment failure as failed even if the intent carries no error detail", () => {
		const event = loadStripeEvent("payment_intent.payment_failed");
		const intent = { ...(event.data.object as Stripe.PaymentIntent), last_payment_error: null, status: "requires_payment_method" as const };
		const result = toWebhookAction({ ...event, data: { ...event.data, object: intent } } as unknown as Stripe.Event);
		expect(result).toMatchObject({ kind: "payment_updated", payment: { status: "failed" } });
	});

	it("maps payment intent statuses from the events", () => {
		const status = (type: StripeFixtureEventType) => {
			const a = action(type);
			return a.kind === "payment_updated" ? a.payment.status : null;
		};
		expect(status("payment_intent.succeeded")).toBe("succeeded");
		expect(status("payment_intent.processing")).toBe("processing");
		expect(status("payment_intent.requires_action")).toBe("requires_action");
		expect(status("payment_intent.canceled")).toBe("canceled");
	});

	it("echoes our refund record id and the refund status", () => {
		expect(action("refund.created")).toMatchObject({ refund: { refundRecordId: "rf_fixture", status: "succeeded" } });
		expect(action("refund.failed")).toMatchObject({ refund: { refundRecordId: "rf_fixture", status: "failed" } });
	});

	it("maps dispute lifecycle statuses", () => {
		const status = (type: StripeFixtureEventType) => {
			const a = action(type);
			return a.kind === "dispute_updated" ? a.dispute.status : null;
		};
		expect(status("charge.dispute.created")).toBe("open");
		expect(status("charge.dispute.updated")).toBe("open");
		expect(status("charge.dispute.closed")).toBe("won");
		expect(status("charge.dispute.funds_withdrawn")).toBe("open");
		expect(status("charge.dispute.funds_reinstated")).toBe("won");
	});

	it("flags a deleted customer", () => {
		expect(action("customer.deleted")).toMatchObject({ kind: "customer_updated", customer: { isDeleted: true } });
		expect(action("customer.created")).toMatchObject({ customer: { isDeleted: false } });
	});

	it("maps subscription events and the trial end", () => {
		expect(action("customer.subscription.created")).toMatchObject({ subscription: { status: "trialing" } });
		expect(action("customer.subscription.deleted")).toMatchObject({ subscription: { status: "canceled" } });
		expect(action("customer.subscription.paused")).toMatchObject({ subscription: { status: "paused" } });
		const trial = loadStripeEvent("customer.subscription.trial_will_end").data.object as Stripe.Subscription;
		expect(action("customer.subscription.trial_will_end")).toEqual({
			kind: "subscription_trial_will_end",
			subscriptionId: trial.id,
			trialEnd: trial.trial_end,
		});
	});

	it("maps invoices", () => {
		expect(action("invoice.paid")).toMatchObject({ invoice: { status: "paid" } });
		expect(action("invoice.payment_failed")).toMatchObject({ kind: "invoice_payment_failed" });
	});

	it("marks deleted catalog objects inactive", () => {
		expect(action("product.deleted")).toMatchObject({ product: { isActive: false } });
		expect(action("product.updated")).toMatchObject({ product: { isActive: true } });
		expect(action("price.deleted")).toMatchObject({ price: { isActive: false } });
		expect(action("price.created")).toMatchObject({ price: { isActive: true } });
	});
});
