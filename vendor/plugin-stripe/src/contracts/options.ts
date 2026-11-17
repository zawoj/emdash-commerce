import { z } from "zod";

import { DEFAULT_ORDER_NUMBER_FORMAT, validateOrderNumberFormat } from "../core/order-number.js";

/**
 * Plugin options. They travel through `astro.config` → EmDash's virtual module as JSON
 * (`createPlugin(JSON.stringify(options))`), so this schema holds only serialisable values.
 * Functions (extensions) are passed by a site entrypoint that calls `createStripeCommercePlugin`
 * directly — see contracts/extensions.ts.
 *
 * Secrets are never options: the Stripe key, webhook secret and token secret come from the plugin's
 * encrypted settings, with `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` env vars as fallback.
 */

const currency = z
	.string()
	.trim()
	.toLowerCase()
	.regex(/^[a-z]{3}$/);

const relativeOrAbsoluteUrl = z
	.string()
	.min(1)
	.refine((value) => value.startsWith("/") || /^https:\/\//.test(value), "Must be a site path (/…) or an https URL");

export const shippingRateOptionSchema = z.object({
	displayName: z.string().min(1).max(100),
	amount: z.number().int().min(0),
	currency,
	deliveryEstimateDays: z.object({ min: z.number().int().min(0), max: z.number().int().min(0) }).nullable().default(null),
});

export const commerceOptionsSchema = z
	.object({
		/** Shown in emails and on the admin status page. */
		storeName: z.string().min(1).max(100).default("Store"),
		defaultCurrency: currency.default("pln"),
		supportedCurrencies: z.array(currency).min(1).default(["pln"]),
		/** Collection slugs, overridable when a site already uses a name. */
		collections: z
			.object({
				products: z.string().default("products"),
				variants: z.string().default("product_variants"),
				prices: z.string().default("prices"),
				attributes: z.string().default("attributes"),
				attributeValues: z.string().default("attribute_values"),
				productTypes: z.string().default("product_types"),
				brands: z.string().default("brands"),
				categories: z.string().default("product_categories"),
				orders: z.string().default("orders"),
				payments: z.string().default("payments"),
				subscriptions: z.string().default("subscriptions"),
				customers: z.string().default("customers"),
				carts: z.string().default("carts"),
				orderEvents: z.string().default("order_events"),
			})
			.prefault({}),
		checkout: z
			.object({
				uiModes: z.array(z.enum(["hosted", "embedded"])).min(1).default(["hosted", "embedded"]),
				successPath: relativeOrAbsoluteUrl.default("/checkout/success?session_id={CHECKOUT_SESSION_ID}"),
				cancelPath: relativeOrAbsoluteUrl.default("/cart"),
				/** Embedded mode: where Stripe sends the buyer after the embedded form completes. */
				returnPath: relativeOrAbsoluteUrl.default("/checkout/return?session_id={CHECKOUT_SESSION_ID}"),
				/** Extra origins allowed for success/cancel/return URLs besides the site URL. */
				allowedRedirectOrigins: z.array(z.string().url()).default([]),
				allowPromotionCodes: z.boolean().default(false),
				billingAddressCollection: z.enum(["auto", "required"]).default("required"),
				shippingAddressCountries: z.array(z.string().length(2).toUpperCase()).default([]),
				shippingRates: z.array(shippingRateOptionSchema).max(5).default([]),
				collectPhone: z.boolean().default(false),
				/** Turn on only with an active Stripe Tax registration; otherwise Stripe collects nothing. */
				automaticTax: z.boolean().default(false),
				locale: z.string().nullable().default(null),
				/** Session lifetime; also how long stock stays reserved. Stripe allows 30–1440. */
				sessionMinutes: z.number().int().min(30).max(1440).default(30),
				/**
				 * How long after a session ended its record is kept before the sweep removes an unpaid checkout (snapshot,
				 * released stock hold and an anonymous cart). A buyer's async payment can settle after the session ended,
				 * so the default keeps the records for two days.
				 */
				abandonedRetentionHours: z.number().int().min(0).max(720).default(48),
			})
			.prefault({}),
		cart: z
			.object({
				ttlDays: z.number().int().min(1).max(90).default(30),
				maxLines: z.number().int().min(1).max(100).default(50),
				maxQuantityPerLine: z.number().int().min(1).max(999).default(99),
				/** A cart with no activity for this long and an email becomes `abandoned` (event). */
				abandonAfterHours: z.number().int().min(1).max(720).default(24),
			})
			.prefault({}),
		inventory: z
			.object({
				lowStockThreshold: z.number().int().min(0).default(5),
			})
			.prefault({}),
		orders: z
			.object({
				numberPrefix: z.string().max(10).default("ORD"),
				/**
				 * Order number template: `{PREFIX}` (numberPrefix), `{YYYY}` (year placed) and exactly one `{seq:N}`
				 * (per-year counter padded to N digits). The `generateOrderNumber` extension still overrides it.
				 */
				numberFormat: z
					.string()
					.default(DEFAULT_ORDER_NUMBER_FORMAT)
					.superRefine((format, ctx) => {
						const problem = validateOrderNumberFormat(format);
						if (problem) ctx.addIssue({ code: "custom", message: problem });
					}),
				/** Lifetime of the signed link that lets a guest view an order and open the portal. */
				accessTokenDays: z.number().int().min(1).max(365).default(30),
				portalReturnPath: relativeOrAbsoluteUrl.default("/"),
			})
			.prefault({}),
		emails: z
			.object({
				isEnabled: z.boolean().default(true),
				orderViewPath: relativeOrAbsoluteUrl.default("/orders/view?token={TOKEN}"),
			})
			.prefault({}),
		rateLimits: z
			.object({
				cartWritesPerMinute: z.number().int().min(1).default(60),
				checkoutPerMinute: z.number().int().min(1).default(10),
				orderLookupPerHour: z.number().int().min(1).default(10),
			})
			.prefault({}),
		webhooks: z
			.object({
				maxAttempts: z.number().int().min(1).max(20).default(8),
				/** Cron reconciliation lists Stripe events after the last one seen (catches missed deliveries). */
				isReconcileEnabled: z.boolean().default(true),
			})
			.prefault({}),
	})
	.strict()
	.superRefine((value, ctx) => {
		if (!value.supportedCurrencies.includes(value.defaultCurrency)) {
			ctx.addIssue({ code: "custom", path: ["defaultCurrency"], message: "defaultCurrency must be in supportedCurrencies" });
		}
	});

export type CommerceOptionsInput = z.input<typeof commerceOptionsSchema>;
export type CommerceOptions = z.output<typeof commerceOptionsSchema>;

/** Settings stored by EmDash (admin → plugin settings); secrets are encrypted at rest. */
export const SETTINGS_KEY = {
	stripeSecretKey: "stripeSecretKey",
	stripeWebhookSecret: "stripeWebhookSecret",
	/** HMAC key for order access tokens; generated on first activation when empty. */
	accessTokenSecret: "accessTokenSecret",
} as const;
