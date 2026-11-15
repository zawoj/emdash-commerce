import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { toCurrencyCode } from "../../core/money.js";
import type { CheckoutSessionInput } from "../../ports/payment-provider.js";
import { resetStripeClients } from "./client.js";
import { STRIPE_API_VERSION } from "./constants.js";
import { createStripeProvider } from "./provider.js";
import { SECRET_KEY, WEBHOOK_SECRET } from "./test-support.js";

/**
 * Runs the real SDK against a stubbed `fetch`, so what is asserted is the HTTP request Stripe would receive:
 * headers, pinned API version, idempotency key and the form encoding of null values.
 */

interface RecordedRequest {
	url: string;
	method: string;
	headers: Headers;
	body: URLSearchParams;
}

const requests: RecordedRequest[] = [];
const responses: Array<{ status: number; body: unknown }> = [];

const json = (status: number, body: unknown) => responses.push({ status, body });

const fetchStub = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
	requests.push({
		url: String(url),
		method: init?.method ?? "GET",
		headers: new Headers(init?.headers),
		body: new URLSearchParams(typeof init?.body === "string" ? init.body : ""),
	});
	const next = responses.shift() ?? { status: 200, body: {} };
	return new Response(JSON.stringify(next.body), { status: next.status, headers: { "content-type": "application/json", "request-id": "req_wire" } });
});

const provider = () =>
	createStripeProvider({ secretKey: SECRET_KEY, webhookSecret: WEBHOOK_SECRET, integrationIdentifier: "emdash-wire", appVersion: "9.9.9" });

const KEY = "stripe-commerce:wire:1";

beforeEach(() => {
	requests.length = 0;
	responses.length = 0;
	fetchStub.mockClear();
	resetStripeClients();
	vi.stubGlobal("fetch", fetchStub);
});

afterEach(() => {
	vi.unstubAllGlobals();
	resetStripeClients();
});

const sessionInput = (overrides: Partial<CheckoutSessionInput> = {}): CheckoutSessionInput => ({
	checkoutId: "chk_1",
	cartId: "cart_1",
	mode: "payment",
	uiMode: "hosted",
	currency: toCurrencyCode("pln"),
	lines: [{ providerPriceId: "price_a", quantity: 1 }],
	customerEmail: "buyer@example.com",
	providerCustomerId: null,
	successUrl: "https://shop.example/ok",
	cancelUrl: "https://shop.example/no",
	returnUrl: null,
	expiresAt: "2027-01-15T08:00:00.000Z",
	locale: null,
	allowPromotionCodes: false,
	billingAddressCollection: "auto",
	shippingAddressCountries: ["PL"],
	shippingRates: [],
	collectPhone: false,
	automaticTax: false,
	trialDays: null,
	extraMetadata: { source: "test" },
	...overrides,
});

const sessionResponse = { id: "cs_test_1", object: "checkout.session", url: "https://checkout.stripe.com/c/pay/cs_test_1", client_secret: null, expires_at: 1_800_000_000 };

describe("requests on the wire", () => {
	it("pins the API version, authenticates, identifies the app and sends the idempotency key", async () => {
		json(200, sessionResponse);
		await provider().checkout.createSession(sessionInput(), KEY);
		const [request] = requests;
		expect(request?.url).toBe("https://api.stripe.com/v1/checkout/sessions");
		expect(request?.method).toBe("POST");
		expect(request?.headers.get("Stripe-Version")).toBe(STRIPE_API_VERSION);
		expect(request?.headers.get("Idempotency-Key")).toBe(KEY);
		expect(request?.headers.get("Authorization")).toBe(`Bearer ${SECRET_KEY}`);
		expect(request?.headers.get("X-Stripe-Client-User-Agent")).toContain("emdash-stripe-commerce");
		expect(request?.headers.get("X-Stripe-Client-User-Agent")).toContain("9.9.9");
	});

	it("encodes the Checkout Session without payment_method_types", async () => {
		json(200, sessionResponse);
		await provider().checkout.createSession(sessionInput(), KEY);
		const body = requests[0]?.body as URLSearchParams;
		expect([...body.keys()].some((key) => key.includes("payment_method_types"))).toBe(false);
		expect(body.get("mode")).toBe("payment");
		expect(body.get("ui_mode")).toBe("hosted_page");
		expect(body.get("customer_creation")).toBe("always");
		expect(body.get("customer_email")).toBe("buyer@example.com");
		expect(body.get("expires_at")).toBe("1800000000");
		expect(body.get("line_items[0][price]")).toBe("price_a");
		expect(body.get("line_items[0][quantity]")).toBe("1");
		expect(body.get("shipping_address_collection[allowed_countries][0]")).toBe("PL");
		expect(body.get("integration_identifier")).toBe("emdash-wire");
		expect(body.get("metadata[emdash_checkout_id]")).toBe("chk_1");
		expect(body.get("metadata[ext_source]")).toBe("test");
		expect(body.get("payment_intent_data[metadata][emdash_cart_id]")).toBe("cart_1");
	});

	it("sends cleared product fields as empty strings", async () => {
		json(200, { id: "prod_1", object: "product", name: "Mug", active: true, metadata: {}, updated: 1 });
		await provider().catalog.updateProduct(
			"prod_1",
			{ entityKey: "product:1", name: "Mug", description: null, imageUrls: [], isActive: true, taxCode: null, extraMetadata: {} },
			KEY,
		);
		const body = requests[0]?.body as URLSearchParams;
		expect(body.get("description")).toBe("");
		expect(body.get("images")).toBe("");
		expect(body.get("tax_code")).toBe("");
		expect(requests[0]?.headers.get("Idempotency-Key")).toBe(KEY);
	});

	it("sends the refund record id and the idempotency key", async () => {
		json(200, { id: "re_1", object: "refund", amount: 500, currency: "eur", status: "succeeded", payment_intent: "pi_1", charge: "ch_1", metadata: { emdash_refund_id: "rf_9" }, reason: null });
		const refund = await provider().payments.createRefund({ paymentIntentId: "pi_1", amount: 500, reason: null, refundRecordId: "rf_9" }, "stripe-commerce:refund:rf_9");
		expect(requests[0]?.body.get("metadata[emdash_refund_id]")).toBe("rf_9");
		expect(requests[0]?.headers.get("Idempotency-Key")).toBe("stripe-commerce:refund:rf_9");
		expect(refund.refundRecordId).toBe("rf_9");
	});

	it("retries a server error with the same idempotency key", async () => {
		json(500, { error: { type: "api_error", message: "temporary" } });
		json(200, { id: "re_1", object: "refund", amount: 1, currency: "eur", status: "succeeded", payment_intent: "pi_1", charge: null, metadata: {}, reason: null });
		await provider().payments.createRefund({ paymentIntentId: "pi_1", amount: 1, reason: null, refundRecordId: "rf_1" }, KEY);
		expect(requests).toHaveLength(2);
		expect(requests.map((request) => request.headers.get("Idempotency-Key"))).toEqual([KEY, KEY]);
	}, 15_000);

	it("maps a 404 resource_missing to null on retrieve", async () => {
		json(404, { error: { type: "invalid_request_error", code: "resource_missing", message: "No such price: 'price_x'" } });
		await expect(provider().catalog.retrievePrice("price_x")).resolves.toBeNull();
	});

	it("maps a 401 to a permanent error without the key in the message", async () => {
		json(401, { error: { type: "invalid_request_error", message: `Invalid API Key provided: ${SECRET_KEY}` } });
		const error = await provider().catalog.retrievePrice("price_x").catch((caught: unknown) => caught);
		expect(error).toMatchObject({ name: "ProviderError", isRetryable: false });
		expect((error as Error).message).not.toContain("FAKEKEY");
	});

	it("never puts the secret key in a request body", async () => {
		json(200, sessionResponse);
		await provider().checkout.createSession(sessionInput(), KEY);
		expect(String(requests[0]?.body)).not.toContain(SECRET_KEY);
	});
});
