import type Stripe from "stripe";

import { CHECKOUT_UI_MODE, PROVIDER_METADATA, type CheckoutSessionInput } from "../../ports/payment-provider.js";
import { PLUGIN_METADATA_VALUE } from "./constants.js";
import { buildMetadata, invalidInput } from "./metadata.js";

/** Stripe allows at most 5 shipping options per Session. */
const MAX_SHIPPING_OPTIONS = 5;

export interface CheckoutParamsResult {
	params: Stripe.Checkout.SessionCreateParams;
	/** Options that were requested but cannot apply, with the reason (the caller may log them). */
	skipped: string[];
}

const requireUrl = (value: string | null, field: string, uiMode: string): string => {
	if (!value) throw invalidInput(`Checkout ${uiMode} mode requires ${field}`);
	return value;
};

const expiresAtSeconds = (iso: string): number => {
	const millis = Date.parse(iso);
	if (Number.isNaN(millis)) throw invalidInput("Checkout expiresAt is not a valid ISO time");
	return Math.floor(millis / 1000);
};

const shippingOptions = (input: CheckoutSessionInput): Stripe.Checkout.SessionCreateParams.ShippingOption[] =>
	input.shippingRates.slice(0, MAX_SHIPPING_OPTIONS).map((rate) => ({
		shipping_rate_data: {
			type: "fixed_amount",
			display_name: rate.displayName,
			fixed_amount: { amount: rate.amount, currency: rate.currency },
			...(rate.deliveryEstimateDays
				? {
						delivery_estimate: {
							minimum: { unit: "business_day", value: rate.deliveryEstimateDays.min },
							maximum: { unit: "business_day", value: rate.deliveryEstimateDays.max },
						},
					}
				: {}),
		},
	}));

/**
 * Builds the Session from our checkout request. Notes on what Stripe accepts, verified against API
 * 2026-10-28.endive in a sandbox:
 * - `payment_method_types` is not sent at all: it is rejected by this API version and methods come from the
 *   Dashboard (dynamic payment methods).
 * - `customer_creation`, `shipping_options` and `payment_intent_data` are payment-mode only; `subscription_data`
 *   is subscription-mode only. Subscription mode always creates a Customer itself.
 * - `success_url` / `cancel_url` belong to `hosted_page`; `embedded_page` takes `return_url` only.
 * - `expires_at` must be 30 minutes to 24 hours ahead (the stock reservation lifetime).
 */
export const buildCheckoutSessionParams = (
	input: CheckoutSessionInput,
	config: { integrationIdentifier: string },
): CheckoutParamsResult => {
	if (input.lines.length === 0) throw invalidInput("Checkout needs at least one line");
	const skipped: string[] = [];
	const isPayment = input.mode === "payment";
	const isSubscription = input.mode === "subscription";
	const hasShippingCountries = input.shippingAddressCountries.length > 0;

	const metadata = buildMetadata(
		{
			[PROVIDER_METADATA.cartId]: input.cartId,
			[PROVIDER_METADATA.checkoutId]: input.checkoutId,
			[PROVIDER_METADATA.pluginId]: PLUGIN_METADATA_VALUE,
		},
		input.extraMetadata,
	);

	const params: Stripe.Checkout.SessionCreateParams = {
		mode: input.mode,
		line_items: input.lines.map((line) => ({ price: line.providerPriceId, quantity: line.quantity })),
		expires_at: expiresAtSeconds(input.expiresAt),
		billing_address_collection: input.billingAddressCollection,
		metadata,
		integration_identifier: config.integrationIdentifier,
	};

	if (input.uiMode === CHECKOUT_UI_MODE.embedded) {
		params.ui_mode = "embedded_page";
		params.return_url = requireUrl(input.returnUrl, "returnUrl", "embedded");
	} else {
		params.ui_mode = "hosted_page";
		params.success_url = requireUrl(input.successUrl, "successUrl", "hosted");
		params.cancel_url = requireUrl(input.cancelUrl, "cancelUrl", "hosted");
	}

	if (input.providerCustomerId) {
		params.customer = input.providerCustomerId;
		// Automatic tax needs an address on the Customer; let Checkout store the one the buyer enters.
		if (input.automaticTax) params.customer_update = { address: "auto" };
	} else {
		if (input.customerEmail) params.customer_email = input.customerEmail;
		// Payment mode otherwise leaves the buyer a guest; subscription mode rejects this parameter.
		if (isPayment) params.customer_creation = "always";
	}

	if (hasShippingCountries) {
		params.shipping_address_collection = {
			allowed_countries: input.shippingAddressCountries.map((country) =>
				country.toUpperCase(),
			) as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[],
		};
	}

	if (input.shippingRates.length > 0) {
		if (isPayment) {
			params.shipping_options = shippingOptions(input);
			if (input.shippingRates.length > MAX_SHIPPING_OPTIONS) {
				skipped.push(`shipping_options: only the first ${MAX_SHIPPING_OPTIONS} of ${input.shippingRates.length} rates were sent`);
			}
		} else {
			skipped.push("shipping_options: Stripe allows shipping rates in payment mode only");
		}
	}

	if (input.collectPhone) params.phone_number_collection = { enabled: true };
	if (input.allowPromotionCodes) params.allow_promotion_codes = true;
	if (input.automaticTax) params.automatic_tax = { enabled: true };
	if (input.locale) params.locale = input.locale as Stripe.Checkout.SessionCreateParams.Locale;

	if (isPayment) {
		// Copied onto the PaymentIntent so `payment_intent.*` events can be linked back to the checkout.
		params.payment_intent_data = { metadata: { ...metadata } };
	}
	if (isSubscription) {
		params.subscription_data = {
			metadata: { ...metadata },
			...(input.trialDays && input.trialDays > 0 ? { trial_period_days: input.trialDays } : {}),
		};
	}
	if (isPayment && input.trialDays) skipped.push("trial_period_days: trials apply to subscription mode only");

	return { params, skipped };
};
