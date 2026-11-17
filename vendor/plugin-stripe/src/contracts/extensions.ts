import type { PricedCart, CartIssue } from "../core/cart.js";
import type { Customer } from "../core/customer.js";
import type { AnyCommerceEvent, CommerceEvent, CommerceEventType } from "../core/events.js";
import type { Order } from "../core/order.js";
import type { Subscription } from "../core/subscription.js";
import type { CheckoutShippingRate } from "../ports/payment-provider.js";
import type { Logger } from "../ports/repositories.js";

/**
 * The extension API: everything a site may customise without forking the plugin. A site that needs
 * extensions points its `astro.config` plugin descriptor at its own entrypoint:
 *
 *   // src/commerce/plugin.ts (site)
 *   import { createStripeCommercePlugin, defineCommerceExtensions } from "@emdash-commerce/plugin-stripe";
 *   const extensions = defineCommerceExtensions({ subscribers: [...], validateCart: ... });
 *   export const createPlugin = (options) => createStripeCommercePlugin(options, extensions);
 *
 * Extensions run inside the plugin's trusted process. Every hook has a timeout and a failure policy:
 * subscribers are retried from the outbox; `validateCart` / `customizeCheckout` failures fail the
 * request with a 500 (they are part of the decision); email renderers fall back to the built-in.
 */

/** Read-only services an extension may use. No provider client: changes go through domain events. */
export interface ExtensionContext {
	log: Logger;
	storeName: string;
	siteUrl: string;
	getOrder(orderId: string): Promise<Order | null>;
	getCustomer(customerId: string): Promise<Customer | null>;
	getSubscription(subscriptionId: string): Promise<Subscription | null>;
}

export interface EventSubscriber<T extends CommerceEventType = CommerceEventType> {
	/** Stable id; delivery state is tracked per subscriber id, so renaming it re-delivers history. */
	id: string;
	events: readonly T[];
	handle(event: CommerceEvent<T>, ctx: ExtensionContext): Promise<void>;
}

/** The checkout knobs a site may change per request. The plugin rebuilds everything else. */
export interface CheckoutCustomization {
	allowPromotionCodes: boolean;
	shippingRates: CheckoutShippingRate[];
	shippingAddressCountries: string[];
	collectPhone: boolean;
	locale: string | null;
	trialDays: number | null;
	/** Prefixed with `ext_` and size-checked before reaching Stripe. */
	metadata: Record<string, string>;
}

export interface EmailMessage {
	subject: string;
	text: string;
	html: string | null;
}

export interface EmailRenderers {
	orderConfirmation?(input: { order: Order; viewUrl: string; storeName: string }): EmailMessage;
	paymentFailed?(input: { order: Order; storeName: string }): EmailMessage;
	refundIssued?(input: { order: Order; amount: number; storeName: string }): EmailMessage;
	orderAccessLink?(input: { orderNumber: string; viewUrl: string; storeName: string }): EmailMessage;
}

export interface CommerceExtensions {
	subscribers?: readonly EventSubscriber<CommerceEventType>[];
	/**
	 * Extra cart rules (minimum order value, region limits, max one subscription…). Returned issues
	 * are added to the priced cart and block checkout.
	 */
	validateCart?(cart: PricedCart, ctx: ExtensionContext): Promise<CartIssue[]>;
	customizeCheckout?(
		defaults: CheckoutCustomization,
		input: { cart: PricedCart; customer: Customer | null },
		ctx: ExtensionContext,
	): Promise<CheckoutCustomization>;
	/** Must be unique; the plugin retries with a new value on collision (max 5). */
	generateOrderNumber?(input: { placedAt: Date; prefix: string }): string;
	emails?: EmailRenderers;
	/**
	 * Raw Stripe events, after the built-in handling of the same event succeeded. Keyed by Stripe event
	 * type, `"*"` for all. Errors make the inbox retry the whole event, so built-in steps must stay
	 * idempotent (they are) and so must these.
	 */
	stripeWebhooks?: Record<string, (event: unknown, ctx: ExtensionContext) => Promise<void>>;
}

/** Identity helper for type inference at the call site. */
export const defineCommerceExtensions = (extensions: CommerceExtensions): CommerceExtensions => extensions;

/** Helper to type a subscriber for one or more event types. */
export const defineSubscriber = <T extends CommerceEventType>(subscriber: EventSubscriber<T>): EventSubscriber<T> =>
	subscriber;

export type { AnyCommerceEvent };
