/**
 * `@emdash-commerce/plugin-stripe`: backend-only commerce for EmDash on Stripe.
 *
 * Plugin entrypoint: `createPlugin(options)` (the JSON descriptor path). A site with extensions calls
 * `createStripeCommercePlugin(options, extensions)` from its own entrypoint.
 */
export { createPlugin, createStripeCommercePlugin } from "./plugin/index.js";
export { PLUGIN_ID, PLUGIN_VERSION } from "./adapters/emdash/constants.js";

// Extension API
export { defineCommerceExtensions, defineSubscriber } from "./contracts/extensions.js";
export type {
	CheckoutCustomization,
	CommerceExtensions,
	EmailMessage,
	EmailRenderers,
	EventSubscriber,
	ExtensionContext,
} from "./contracts/extensions.js";

// Email helpers for site renderers: start from the built-in templates and escape what you interpolate.
export { defaultEmailRenderers } from "./services/emails/defaults.js";
export { escapeHtml, formatAmount } from "./services/emails/html.js";

/*
 * Deliberately NOT exported: services (`requestRefund`, `cancelSubscription`, `reconcile`, the admin use cases).
 * Money and system operations have exactly two entry points, the private admin routes and the MCP tools, and
 * both sit behind EmDash's permission check (`content:edit_any` to read, `plugins:manage` to act). A package
 * export would let site code move money without that check, and would freeze service signatures as public API.
 * Sites react to events (`defineSubscriber`) and call the HTTP routes; they do not reach into the services.
 */

// Contracts
export { commerceOptionsSchema, SETTINGS_KEY } from "./contracts/options.js";
export type { CommerceOptions, CommerceOptionsInput } from "./contracts/options.js";
export { CART_COOKIE, CART_HEADER, CART_ID_PATTERN, ROUTE } from "./contracts/api.js";

// Domain types and vocabularies
export * from "./core/cart.js";
export * from "./core/catalog.js";
export * from "./core/customer.js";
export * from "./core/errors.js";
export * from "./core/events.js";
export * from "./core/inventory.js";
export * from "./core/money.js";
export * from "./core/order-lifecycle.js";
export * from "./core/order-timeline.js";
export * from "./core/order.js";
export * from "./core/payment.js";
export * from "./core/subscription.js";
