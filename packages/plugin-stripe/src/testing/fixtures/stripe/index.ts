import { readFileSync } from "node:fs";

import type Stripe from "stripe";

/**
 * Stripe payload fixtures for tests (this module is test-only: it reads files with `node:fs`).
 * Event files are named after the event type; object files are the bodies of retrieve calls.
 * Everything is scrubbed to example values and carries no idempotency keys or API keys.
 */

export const STRIPE_FIXTURE_EVENT_TYPES = [
	"charge.dispute.closed",
	"charge.dispute.created",
	"charge.dispute.funds_reinstated",
	"charge.dispute.funds_withdrawn",
	"charge.dispute.updated",
	"checkout.session.async_payment_failed",
	"checkout.session.async_payment_succeeded",
	"checkout.session.completed",
	"checkout.session.expired",
	"customer.created",
	"customer.deleted",
	"customer.subscription.created",
	"customer.subscription.deleted",
	"customer.subscription.paused",
	"customer.subscription.resumed",
	"customer.subscription.trial_will_end",
	"customer.subscription.updated",
	"customer.updated",
	"invoice.paid",
	"invoice.payment_failed",
	"payment_intent.canceled",
	"payment_intent.payment_failed",
	"payment_intent.processing",
	"payment_intent.requires_action",
	"payment_intent.succeeded",
	"price.created",
	"price.deleted",
	"price.updated",
	"product.created",
	"product.deleted",
	"product.updated",
	"refund.created",
	"refund.failed",
	"refund.updated",
] as const;
export type StripeFixtureEventType = (typeof STRIPE_FIXTURE_EVENT_TYPES)[number];

export const STRIPE_FIXTURE_OBJECTS = {
	/** A completed payment-mode session retrieved with `expand[]=line_items`. */
	checkoutSession: "objects/checkout-session.json",
	/** The same session shaped with a discount, tax, shipping cost and a shipping address (hand-made from the real one). */
	checkoutSessionShipping: "objects/checkout-session-shipping.json",
	subscription: "objects/subscription.json",
	/** A paid subscription invoice retrieved with `expand[]=payments.data.payment.payment_intent`. */
	invoiceSubscription: "objects/invoice-subscription.json",
	/** A succeeded PaymentIntent retrieved with `expand[]=latest_charge`. */
	paymentIntent: "objects/payment-intent.json",
} as const;
export type StripeFixtureObject = keyof typeof STRIPE_FIXTURE_OBJECTS;

const readJson = (relative: string): unknown => JSON.parse(readFileSync(new URL(relative, import.meta.url), "utf8"));

export const loadStripeEvent = (type: StripeFixtureEventType): Stripe.Event => readJson(`./events/${type}.json`) as Stripe.Event;

export const loadStripeObject = <T>(name: StripeFixtureObject): T => readJson(`./${STRIPE_FIXTURE_OBJECTS[name]}`) as T;

/** How each event fixture was produced: captured from the sandbox, triggered there, or derived by editing a real one. */
export const STRIPE_FIXTURE_PROVENANCE = readJson("./provenance.json") as Record<StripeFixtureEventType, "real" | "triggered" | "derived">;
