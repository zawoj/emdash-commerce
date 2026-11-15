import { describe, expect, it } from "vitest";

import { toCurrencyCode } from "../../core/money.js";
import { ProviderError, type CheckoutSessionInput } from "../../ports/payment-provider.js";
import { buildCheckoutSessionParams } from "./checkout-params.js";

const CONFIG = { integrationIdentifier: "emdash-stripe-commerce-test" };
const EXPIRES_AT = "2027-01-15T08:00:00.000Z";
const EXPIRES_SECONDS = 1_800_000_000;

const input = (overrides: Partial<CheckoutSessionInput> = {}): CheckoutSessionInput => ({
	checkoutId: "chk_1",
	cartId: "cart_1",
	mode: "payment",
	uiMode: "hosted",
	currency: toCurrencyCode("pln"),
	lines: [{ providerPriceId: "price_a", quantity: 2 }],
	customerEmail: "buyer@example.com",
	providerCustomerId: null,
	successUrl: "https://shop.example/success",
	cancelUrl: "https://shop.example/cancel",
	returnUrl: null,
	expiresAt: EXPIRES_AT,
	locale: null,
	allowPromotionCodes: false,
	billingAddressCollection: "auto",
	shippingAddressCountries: [],
	shippingRates: [],
	collectPhone: false,
	automaticTax: false,
	trialDays: null,
	extraMetadata: {},
	...overrides,
});

const build = (overrides: Partial<CheckoutSessionInput> = {}) => buildCheckoutSessionParams(input(overrides), CONFIG);

describe.each([
	["hosted", "payment"],
	["hosted", "subscription"],
	["embedded", "payment"],
	["embedded", "subscription"],
] as const)("%s %s session", (uiMode, mode) => {
	const overrides: Partial<CheckoutSessionInput> = {
		uiMode,
		mode,
		...(uiMode === "embedded" ? { successUrl: null, cancelUrl: null, returnUrl: "https://shop.example/return" } : {}),
	};

	it("never sends payment_method_types (rejected by this API version; methods come from the Dashboard)", () => {
		const { params } = build(overrides);
		expect(Object.keys(params)).not.toContain("payment_method_types");
		expect(JSON.stringify(params)).not.toContain("payment_method_types");
	});

	it("sets mode, lines, expiry, integration identifier and billing address collection", () => {
		const { params } = build(overrides);
		expect(params).toMatchObject({
			mode,
			line_items: [{ price: "price_a", quantity: 2 }],
			expires_at: EXPIRES_SECONDS,
			integration_identifier: CONFIG.integrationIdentifier,
			billing_address_collection: "auto",
		});
	});

	it("tags the session with the plugin ids", () => {
		const { params } = build(overrides);
		expect(params.metadata).toEqual({ emdash_cart_id: "cart_1", emdash_checkout_id: "chk_1", emdash_plugin: "stripe-commerce" });
	});

	it("uses the redirect fields of its UI mode only", () => {
		const { params } = build(overrides);
		if (uiMode === "hosted") {
			expect(params).toMatchObject({ ui_mode: "hosted_page", success_url: "https://shop.example/success", cancel_url: "https://shop.example/cancel" });
			expect(params.return_url).toBeUndefined();
		} else {
			expect(params).toMatchObject({ ui_mode: "embedded_page", return_url: "https://shop.example/return" });
			expect(params.success_url).toBeUndefined();
			expect(params.cancel_url).toBeUndefined();
		}
	});

	it("links the buyer by email and creates a Customer only in payment mode", () => {
		const { params } = build(overrides);
		expect(params.customer_email).toBe("buyer@example.com");
		expect(params.customer).toBeUndefined();
		expect(params.customer_creation).toBe(mode === "payment" ? "always" : undefined);
	});

	it("uses an existing customer instead of the email and never customer_creation", () => {
		const { params } = build({ ...overrides, providerCustomerId: "cus_1" });
		expect(params.customer).toBe("cus_1");
		expect(params.customer_email).toBeUndefined();
		expect(params.customer_creation).toBeUndefined();
	});

	it("puts mode-specific data only where Stripe accepts it", () => {
		const { params } = build({ ...overrides, trialDays: 7 });
		if (mode === "payment") {
			expect(params.payment_intent_data?.metadata).toMatchObject({ emdash_checkout_id: "chk_1" });
			expect(params.subscription_data).toBeUndefined();
		} else {
			expect(params.subscription_data?.metadata).toMatchObject({ emdash_checkout_id: "chk_1" });
			expect(params.subscription_data?.trial_period_days).toBe(7);
			expect(params.payment_intent_data).toBeUndefined();
		}
	});
});

describe("buildCheckoutSessionParams options", () => {
	it("omits optional switches that are off", () => {
		const { params } = build();
		for (const key of ["allow_promotion_codes", "automatic_tax", "phone_number_collection", "locale", "shipping_address_collection", "shipping_options", "customer_update"] as const) {
			expect(params[key]).toBeUndefined();
		}
	});

	it("turns the switches on", () => {
		const { params } = build({ allowPromotionCodes: true, automaticTax: true, collectPhone: true, locale: "pl", billingAddressCollection: "required" });
		expect(params).toMatchObject({
			allow_promotion_codes: true,
			automatic_tax: { enabled: true },
			phone_number_collection: { enabled: true },
			locale: "pl",
			billing_address_collection: "required",
		});
	});

	it("lets Checkout store the address of an existing customer when tax is automatic", () => {
		expect(build({ providerCustomerId: "cus_1", automaticTax: true }).params.customer_update).toEqual({ address: "auto" });
		expect(build({ providerCustomerId: null, automaticTax: true }).params.customer_update).toBeUndefined();
	});

	it("only starts a trial for a positive number of days", () => {
		expect(build({ mode: "subscription", trialDays: 0 }).params.subscription_data?.trial_period_days).toBeUndefined();
		expect(build({ mode: "subscription", trialDays: null }).params.subscription_data?.trial_period_days).toBeUndefined();
		expect(build({ mode: "subscription", trialDays: 14 }).params.subscription_data?.trial_period_days).toBe(14);
	});

	it("ignores a trial in payment mode and says so", () => {
		const { params, skipped } = build({ mode: "payment", trialDays: 14 });
		expect(JSON.stringify(params)).not.toContain("trial_period_days");
		expect(skipped.join(" ")).toContain("trial");
	});

	it("collects shipping countries in upper case", () => {
		const { params } = build({ shippingAddressCountries: ["pl", "DE"] });
		expect(params.shipping_address_collection).toEqual({ allowed_countries: ["PL", "DE"] });
	});

	it("rejects a session without lines", () => {
		expect(() => build({ lines: [] })).toThrow(ProviderError);
	});

	it("requires the URLs of the chosen UI mode", () => {
		expect(() => build({ uiMode: "hosted", successUrl: null })).toThrow("successUrl");
		expect(() => build({ uiMode: "hosted", cancelUrl: null })).toThrow("cancelUrl");
		expect(() => build({ uiMode: "embedded", returnUrl: null })).toThrow("returnUrl");
	});

	it("rejects an invalid expiry", () => {
		expect(() => build({ expiresAt: "tomorrow" })).toThrow("expiresAt");
	});
});

describe("shipping options", () => {
	const rate = { displayName: "Courier", amount: 1500, currency: toCurrencyCode("pln"), deliveryEstimateDays: { min: 1, max: 3 } };

	it("sends fixed-amount shipping rate data in payment mode", () => {
		const { params, skipped } = build({ shippingAddressCountries: ["PL"], shippingRates: [rate, { ...rate, displayName: "Pickup", amount: 0, deliveryEstimateDays: null }] });
		expect(params.shipping_options).toEqual([
			{
				shipping_rate_data: {
					type: "fixed_amount",
					display_name: "Courier",
					fixed_amount: { amount: 1500, currency: "pln" },
					delivery_estimate: { minimum: { unit: "business_day", value: 1 }, maximum: { unit: "business_day", value: 3 } },
				},
			},
			{ shipping_rate_data: { type: "fixed_amount", display_name: "Pickup", fixed_amount: { amount: 0, currency: "pln" } } },
		]);
		expect(skipped).toEqual([]);
	});

	it("skips shipping options in subscription mode (Stripe: payment mode only) and keeps address collection", () => {
		const { params, skipped } = build({ mode: "subscription", shippingAddressCountries: ["PL"], shippingRates: [rate] });
		expect(params.shipping_options).toBeUndefined();
		expect(params.shipping_address_collection).toBeDefined();
		expect(skipped).toEqual([expect.stringContaining("payment mode only")]);
	});

	it("sends at most five rates", () => {
		const { params, skipped } = build({ shippingRates: Array.from({ length: 7 }, (_, i) => ({ ...rate, displayName: `R${i}` })) });
		expect(params.shipping_options).toHaveLength(5);
		expect(skipped[0]).toContain("5 of 7");
	});
});

describe("metadata", () => {
	it("namespaces extension metadata under ext_ without double-prefixing", () => {
		const { params } = build({ extraMetadata: { source: "newsletter", ext_campaign: "spring" } });
		expect(params.metadata).toMatchObject({ ext_source: "newsletter", ext_campaign: "spring" });
		expect(params.metadata).not.toHaveProperty("source");
		expect(params.metadata).not.toHaveProperty("ext_ext_campaign");
	});

	it("lets plugin keys win over any extension attempt", () => {
		const { params } = build({
			extraMetadata: { emdash_checkout_id: "attacker", emdash_cart_id: "attacker", emdash_plugin: "attacker", ext_emdash_plugin: "ok" },
		});
		expect(params.metadata).toMatchObject({ emdash_checkout_id: "chk_1", emdash_cart_id: "cart_1", emdash_plugin: "stripe-commerce" });
	});

	it("copies the same metadata to the PaymentIntent so payment_intent events link back", () => {
		const { params } = build({ extraMetadata: { a: "b" } });
		expect(params.payment_intent_data?.metadata).toEqual(params.metadata);
		expect(params.payment_intent_data?.metadata).not.toBe(params.metadata);
	});

	it("accepts exactly the Stripe limits", () => {
		const extraMetadata: Record<string, string> = {};
		for (let i = 0; i < 46; i += 1) extraMetadata[`k${i}`.padEnd(36, "x")] = "v".repeat(500); // 4 + 36 = ext_ + 36 = 40
		expect(() => build({ extraMetadata })).not.toThrow();
	});

	it("rejects more than 50 keys", () => {
		const extraMetadata = Object.fromEntries(Array.from({ length: 48 }, (_, i) => [`k${i}`, "v"]));
		expect(() => build({ extraMetadata })).toThrow("at most 50 keys");
	});

	it("rejects a key longer than 40 characters (after the ext_ prefix)", () => {
		expect(() => build({ extraMetadata: { ["k".repeat(37)]: "v" } })).toThrow("keys must be 1-40");
	});

	it("rejects a value longer than 500 characters", () => {
		expect(() => build({ extraMetadata: { note: "x".repeat(501) } })).toThrow("exceeds 500");
	});

	it("reports metadata violations as non-retryable", () => {
		try {
			build({ extraMetadata: { note: "x".repeat(501) } });
			expect.unreachable();
		} catch (error) {
			expect(error).toBeInstanceOf(ProviderError);
			expect((error as ProviderError).isRetryable).toBe(false);
		}
	});
});
