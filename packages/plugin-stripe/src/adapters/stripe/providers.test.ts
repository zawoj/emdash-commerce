import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";

import { toCurrencyCode } from "../../core/money.js";
import { ProviderError, type CheckoutSessionInput, type ProviderPriceInput, type ProviderProductInput } from "../../ports/payment-provider.js";
import { loadStripeEvent, loadStripeObject } from "../../testing/fixtures/stripe/index.js";
import { describeStripeAccount } from "./account.js";
import { buildPriceCreateParams, buildProductCreateParams, buildProductUpdateParams, createCatalogProvider, publicImageUrls } from "./catalog.js";
import { createCheckoutProvider } from "./checkout.js";
import { createCustomersProvider } from "./customers.js";
import { createPaymentsProvider } from "./payments.js";
import { createStripeProvider } from "./provider.js";
import { createSubscriptionsProvider } from "./subscriptions.js";
import { fakeStripe, SECRET_KEY, stripeError, WEBHOOK_SECRET } from "./test-support.js";

const KEY = "stripe-commerce:test:1";
const NOT_FOUND = stripeError("StripeInvalidRequestError", { message: "No such object", code: "resource_missing", statusCode: 404 });
const OUTAGE = stripeError("StripeAPIError", { message: "down", statusCode: 500 });

const eventObject = <T>(type: Parameters<typeof loadStripeEvent>[0]): T => loadStripeEvent(type).data.object as unknown as T;

const productInput = (overrides: Partial<ProviderProductInput> = {}): ProviderProductInput => ({
	entityKey: "product:p1",
	name: "Mug",
	description: "A mug",
	imageUrls: ["https://cdn.example.com/mug.jpg"],
	isActive: true,
	taxCode: "txcd_99999999",
	extraMetadata: {},
	...overrides,
});

const priceInput = (overrides: Partial<ProviderPriceInput> = {}): ProviderPriceInput => ({
	entityKey: "price:pr1",
	providerProductId: "prod_1",
	unitAmount: 1999,
	currency: toCurrencyCode("pln"),
	recurring: null,
	taxBehavior: "inclusive",
	nickname: null,
	lookupKey: null,
	...overrides,
});

describe("catalog provider", () => {
	const product = { ...eventObject<Stripe.Product>("product.created"), metadata: { emdash_entity: "product:p1" } };
	const price = { ...eventObject<Stripe.Price>("price.created"), metadata: { emdash_entity: "price:pr1" } };

	it("creates a product tagged with its entity and passes the idempotency key", async () => {
		const create = vi.fn().mockResolvedValue(product);
		const provider = createCatalogProvider(() => fakeStripe({ products: { create } }));
		const snapshot = await provider.createProduct(productInput({ extraMetadata: { sku: "MUG-1" } }), KEY);
		expect(create).toHaveBeenCalledWith(
			{
				name: "Mug",
				active: true,
				description: "A mug",
				images: ["https://cdn.example.com/mug.jpg"],
				tax_code: "txcd_99999999",
				metadata: { sku: "MUG-1", emdash_entity: "product:p1", emdash_plugin: "stripe-commerce" },
			},
			{ idempotencyKey: KEY },
		);
		expect(snapshot).toMatchObject({ providerId: product.id, entityKey: "product:p1" });
	});

	it("never lets product extra metadata overwrite the entity key", () => {
		const params = buildProductCreateParams(productInput({ extraMetadata: { emdash_entity: "product:evil" } }));
		expect(params.metadata).toMatchObject({ emdash_entity: "product:p1" });
	});

	it("omits description, images and tax code that are not set", () => {
		const params = buildProductCreateParams(productInput({ description: null, imageUrls: [], taxCode: null }));
		expect(params).not.toHaveProperty("description");
		expect(params).not.toHaveProperty("images");
		expect(params).not.toHaveProperty("tax_code");
	});

	it("clears description, images and tax code on update when they are gone", () => {
		expect(buildProductUpdateParams(productInput({ description: null, imageUrls: ["/relative.png"], taxCode: null }))).toMatchObject({
			description: null,
			images: null,
			tax_code: null,
		});
	});

	it("updates a product and passes the idempotency key", async () => {
		const update = vi.fn().mockResolvedValue(product);
		const provider = createCatalogProvider(() => fakeStripe({ products: { update } }));
		await provider.updateProduct("prod_1", productInput({ isActive: false }), KEY);
		expect(update).toHaveBeenCalledWith("prod_1", expect.objectContaining({ active: false }), { idempotencyKey: KEY });
	});

	it("keeps only public absolute https images, at most 8", () => {
		expect(
			publicImageUrls([
				"https://cdn.example.com/a.jpg",
				"http://cdn.example.com/b.jpg",
				"/uploads/c.jpg",
				"https://localhost:3000/d.jpg",
				"https://127.0.0.1/e.jpg",
				"https://shop.local/f.jpg",
				"not a url",
			]),
		).toEqual(["https://cdn.example.com/a.jpg"]);
		const many = Array.from({ length: 12 }, (_, i) => `https://cdn.example.com/${i}.jpg`);
		expect(publicImageUrls(many)).toHaveLength(8);
	});

	it("retrieves a product and maps resource_missing to null", async () => {
		const retrieve = vi.fn().mockResolvedValueOnce(product).mockRejectedValueOnce(NOT_FOUND).mockRejectedValueOnce(OUTAGE);
		const provider = createCatalogProvider(() => fakeStripe({ products: { retrieve } }));
		await expect(provider.retrieveProduct("prod_1")).resolves.toMatchObject({ providerId: product.id });
		await expect(provider.retrieveProduct("prod_gone")).resolves.toBeNull();
		await expect(provider.retrieveProduct("prod_1")).rejects.toMatchObject({ isRetryable: true });
	});

	it("finds a product by entity through metadata search, escaping the value", async () => {
		const search = vi.fn().mockResolvedValue({ data: [{ ...product, active: false, created: 300 }, { ...product, id: "prod_new", created: 200 }, { ...product, id: "prod_old", created: 100 }] });
		const provider = createCatalogProvider(() => fakeStripe({ products: { search } }));
		const found = await provider.findProductByEntity("product:o'brien\\x");
		expect(search).toHaveBeenCalledWith({ query: "metadata['emdash_entity']:'product:o\\'brien\\\\x'", limit: 10 });
		// the active one wins over a newer archived one
		expect(found?.providerId).toBe("prod_new");
	});

	it("returns null when search finds nothing", async () => {
		const search = vi.fn().mockResolvedValue({ data: [] });
		const provider = createCatalogProvider(() => fakeStripe({ products: { search } }));
		await expect(provider.findProductByEntity("product:none")).resolves.toBeNull();
	});

	it("creates a one-time price with metadata and idempotency key", async () => {
		const create = vi.fn().mockResolvedValue(price);
		const provider = createCatalogProvider(() => fakeStripe({ prices: { create } }));
		const snapshot = await provider.createPrice(priceInput(), KEY);
		expect(create).toHaveBeenCalledWith(
			{
				product: "prod_1",
				unit_amount: 1999,
				currency: "pln",
				tax_behavior: "inclusive",
				metadata: { emdash_entity: "price:pr1", emdash_plugin: "stripe-commerce" },
			},
			{ idempotencyKey: KEY },
		);
		expect(snapshot).toMatchObject({ providerId: price.id, entityKey: "price:pr1" });
	});

	it("transfers the lookup key and sends recurring terms", () => {
		expect(
			buildPriceCreateParams(priceInput({ lookupKey: "mug-monthly", nickname: "Monthly", recurring: { interval: "month", intervalCount: 3 } })),
		).toMatchObject({
			lookup_key: "mug-monthly",
			transfer_lookup_key: true,
			nickname: "Monthly",
			recurring: { interval: "month", interval_count: 3 },
		});
		expect(buildPriceCreateParams(priceInput())).not.toHaveProperty("lookup_key");
		expect(buildPriceCreateParams(priceInput())).not.toHaveProperty("transfer_lookup_key");
	});

	it("updates only the mutable price fields it was given", async () => {
		const update = vi.fn().mockResolvedValue(price);
		const provider = createCatalogProvider(() => fakeStripe({ prices: { update } }));
		await provider.updatePrice("price_1", { isActive: false }, KEY);
		expect(update).toHaveBeenLastCalledWith("price_1", { active: false }, { idempotencyKey: KEY });
		await provider.updatePrice("price_1", { lookupKey: "k", transferLookupKey: true, nickname: null }, KEY);
		expect(update).toHaveBeenLastCalledWith("price_1", { lookup_key: "k", transfer_lookup_key: true, nickname: "" }, { idempotencyKey: KEY });
	});

	it("retrieves a price and maps resource_missing to null", async () => {
		const retrieve = vi.fn().mockResolvedValueOnce(price).mockRejectedValueOnce(NOT_FOUND);
		const provider = createCatalogProvider(() => fakeStripe({ prices: { retrieve } }));
		await expect(provider.retrievePrice("price_1")).resolves.toMatchObject({ providerId: price.id });
		await expect(provider.retrievePrice("price_gone")).resolves.toBeNull();
	});

	it("reports a write failure as a ProviderError with retryability", async () => {
		const create = vi.fn().mockRejectedValue(OUTAGE);
		const provider = createCatalogProvider(() => fakeStripe({ products: { create } }));
		await expect(provider.createProduct(productInput(), KEY)).rejects.toMatchObject({ name: "ProviderError", isRetryable: true });
	});
});

describe("checkout provider", () => {
	const session = loadStripeObject<Stripe.Checkout.Session>("checkoutSession");
	const input = (overrides: Partial<CheckoutSessionInput> = {}): CheckoutSessionInput => ({
		checkoutId: "chk_1",
		cartId: "cart_1",
		mode: "payment",
		uiMode: "hosted",
		currency: toCurrencyCode("pln"),
		lines: [{ providerPriceId: "price_a", quantity: 1 }],
		customerEmail: null,
		providerCustomerId: null,
		successUrl: "https://shop.example/ok",
		cancelUrl: "https://shop.example/no",
		returnUrl: null,
		expiresAt: "2027-01-15T08:00:00.000Z",
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
	const config = { integrationIdentifier: "emdash-test" };

	it("creates a hosted session with the idempotency key and returns its url", async () => {
		const create = vi.fn().mockResolvedValue({ ...session, url: "https://checkout.example/s", client_secret: null, expires_at: 1_800_000_000 });
		const provider = createCheckoutProvider(() => fakeStripe({ checkout: { sessions: { create } } }), config);
		const result = await provider.createSession(input(), KEY);
		expect(create).toHaveBeenCalledWith(expect.objectContaining({ mode: "payment", ui_mode: "hosted_page" }), { idempotencyKey: KEY });
		expect(result).toEqual({ sessionId: session.id, url: "https://checkout.example/s", clientSecret: null, expiresAt: "2027-01-15T08:00:00.000Z" });
	});

	it("creates an embedded session and returns the client secret", async () => {
		const create = vi.fn().mockResolvedValue({ ...session, url: null, client_secret: "cs_secret_1", expires_at: 1_800_000_000 });
		const provider = createCheckoutProvider(() => fakeStripe({ checkout: { sessions: { create } } }), config);
		const result = await provider.createSession(input({ uiMode: "embedded", successUrl: null, cancelUrl: null, returnUrl: "https://shop.example/r" }), KEY);
		expect(result.clientSecret).toBe("cs_secret_1");
	});

	it("fails when Stripe returns a hosted session without a url", async () => {
		const create = vi.fn().mockResolvedValue({ ...session, url: null, client_secret: null, expires_at: 1_800_000_000 });
		const provider = createCheckoutProvider(() => fakeStripe({ checkout: { sessions: { create } } }), config);
		await expect(provider.createSession(input(), KEY)).rejects.toMatchObject({ isRetryable: false });
	});

	it("does not call Stripe when the input is invalid", async () => {
		const create = vi.fn();
		const provider = createCheckoutProvider(() => fakeStripe({ checkout: { sessions: { create } } }), config);
		await expect(provider.createSession(input({ lines: [] }), KEY)).rejects.toBeInstanceOf(ProviderError);
		expect(create).not.toHaveBeenCalled();
	});

	it("retrieves a session with line items expanded", async () => {
		const retrieve = vi.fn().mockResolvedValue(session);
		const provider = createCheckoutProvider(() => fakeStripe({ checkout: { sessions: { retrieve } } }), config);
		await expect(provider.retrieveSession(session.id)).resolves.toMatchObject({ sessionId: session.id, lines: [expect.anything()] });
		expect(retrieve).toHaveBeenCalledWith(session.id, { expand: ["line_items"] });
	});

	it("returns null for a missing session", async () => {
		const retrieve = vi.fn().mockRejectedValue(NOT_FOUND);
		const provider = createCheckoutProvider(() => fakeStripe({ checkout: { sessions: { retrieve } } }), config);
		await expect(provider.retrieveSession("cs_gone")).resolves.toBeNull();
	});

	describe("expireSession", () => {
		const notOpen = stripeError("StripeInvalidRequestError", { message: "Only Checkout Sessions with a status in (open) can be expired.", statusCode: 400 });

		it("expires an open session", async () => {
			const expire = vi.fn().mockResolvedValue({});
			const provider = createCheckoutProvider(() => fakeStripe({ checkout: { sessions: { expire } } }), config);
			await expect(provider.expireSession("cs_1")).resolves.toBeUndefined();
			expect(expire).toHaveBeenCalledWith("cs_1");
		});

		it.each(["complete", "expired"] as const)("is not an error when the session is already %s", async (status) => {
			const expire = vi.fn().mockRejectedValue(notOpen);
			const retrieve = vi.fn().mockResolvedValue({ ...session, status });
			const provider = createCheckoutProvider(() => fakeStripe({ checkout: { sessions: { expire, retrieve } } }), config);
			await expect(provider.expireSession("cs_1")).resolves.toBeUndefined();
		});

		it("is not an error when the session is gone", async () => {
			const expire = vi.fn().mockRejectedValue(NOT_FOUND);
			const retrieve = vi.fn().mockRejectedValue(NOT_FOUND);
			const provider = createCheckoutProvider(() => fakeStripe({ checkout: { sessions: { expire, retrieve } } }), config);
			await expect(provider.expireSession("cs_gone")).resolves.toBeUndefined();
		});

		it("still fails when the session is open and Stripe is down", async () => {
			const expire = vi.fn().mockRejectedValue(OUTAGE);
			const retrieve = vi.fn().mockResolvedValue({ ...session, status: "open" });
			const provider = createCheckoutProvider(() => fakeStripe({ checkout: { sessions: { expire, retrieve } } }), config);
			await expect(provider.expireSession("cs_1")).rejects.toMatchObject({ isRetryable: true });
		});
	});
});

describe("payments provider", () => {
	it("retrieves a payment with its charge expanded", async () => {
		const retrieve = vi.fn().mockResolvedValue(loadStripeObject<Stripe.PaymentIntent>("paymentIntent"));
		const provider = createPaymentsProvider(() => fakeStripe({ paymentIntents: { retrieve } }));
		await expect(provider.retrievePayment("pi_1")).resolves.toMatchObject({ status: "succeeded", methodType: "card" });
		expect(retrieve).toHaveBeenCalledWith("pi_1", { expand: ["latest_charge"] });
	});

	it("returns null for a missing payment", async () => {
		const retrieve = vi.fn().mockRejectedValue(NOT_FOUND);
		const provider = createPaymentsProvider(() => fakeStripe({ paymentIntents: { retrieve } }));
		await expect(provider.retrievePayment("pi_gone")).resolves.toBeNull();
	});

	it("creates a refund carrying our record id and the idempotency key, and echoes the id back", async () => {
		const stripeRefund = eventObject<Stripe.Refund>("refund.created");
		const create = vi.fn().mockResolvedValue(stripeRefund);
		const provider = createPaymentsProvider(() => fakeStripe({ refunds: { create } }));
		const refund = await provider.createRefund({ paymentIntentId: "pi_1", amount: 500, reason: "requested_by_customer", refundRecordId: "rf_fixture" }, "stripe-commerce:refund:rf_fixture");
		expect(create).toHaveBeenCalledWith(
			{
				payment_intent: "pi_1",
				amount: 500,
				reason: "requested_by_customer",
				metadata: { emdash_refund_id: "rf_fixture", emdash_plugin: "stripe-commerce" },
			},
			{ idempotencyKey: "stripe-commerce:refund:rf_fixture" },
		);
		expect(refund).toMatchObject({ refundId: stripeRefund.id, refundRecordId: "rf_fixture", amount: 500 });
	});

	it("omits the reason when there is none", async () => {
		const create = vi.fn().mockResolvedValue(eventObject<Stripe.Refund>("refund.created"));
		const provider = createPaymentsProvider(() => fakeStripe({ refunds: { create } }));
		await provider.createRefund({ paymentIntentId: "pi_1", amount: 1, reason: null, refundRecordId: "rf_1" }, KEY);
		expect(create.mock.calls[0]?.[0]).not.toHaveProperty("reason");
	});

	it("does not retry a refund Stripe refused", async () => {
		const refused = stripeError("StripeInvalidRequestError", { message: "Charge has already been refunded", code: "charge_already_refunded", statusCode: 400 });
		const create = vi.fn().mockRejectedValue(refused);
		const provider = createPaymentsProvider(() => fakeStripe({ refunds: { create } }));
		await expect(provider.createRefund({ paymentIntentId: "pi_1", amount: 1, reason: null, refundRecordId: "rf_1" }, KEY)).rejects.toMatchObject({
			isRetryable: false,
			providerCode: "charge_already_refunded",
		});
	});
});

describe("customers provider", () => {
	it("creates a customer tagged with our record id and the idempotency key", async () => {
		const create = vi.fn().mockResolvedValue({ ...eventObject<Stripe.Customer>("customer.created"), email: "a@example.com" });
		const provider = createCustomersProvider(() => fakeStripe({ customers: { create } }));
		const customer = await provider.createCustomer({ customerRecordId: "cust_1", email: "a@example.com", name: "A", phone: null }, KEY);
		expect(create).toHaveBeenCalledWith(
			{ email: "a@example.com", name: "A", metadata: { emdash_customer_id: "cust_1", emdash_plugin: "stripe-commerce" } },
			{ idempotencyKey: KEY },
		);
		expect(customer.email).toBe("a@example.com");
	});

	it("retrieves a customer, flags a deleted one, and returns null for a missing one", async () => {
		const retrieve = vi
			.fn()
			.mockResolvedValueOnce({ id: "cus_1", object: "customer", deleted: true })
			.mockRejectedValueOnce(NOT_FOUND);
		const provider = createCustomersProvider(() => fakeStripe({ customers: { retrieve } }));
		await expect(provider.retrieveCustomer("cus_1")).resolves.toMatchObject({ isDeleted: true });
		await expect(provider.retrieveCustomer("cus_gone")).resolves.toBeNull();
	});

	it("creates a portal session", async () => {
		const create = vi.fn().mockResolvedValue({ url: "https://billing.example/p" });
		const provider = createCustomersProvider(() => fakeStripe({ billingPortal: { sessions: { create } } }));
		await expect(provider.createPortalSession({ providerCustomerId: "cus_1", returnUrl: "https://shop.example/account" })).resolves.toEqual({ url: "https://billing.example/p" });
		expect(create).toHaveBeenCalledWith({ customer: "cus_1", return_url: "https://shop.example/account" });
	});

	it("explains a missing portal configuration as a permanent, readable error", async () => {
		const unconfigured = stripeError("StripeInvalidRequestError", {
			message: "No configuration provided and your test mode default configuration has not been created. Provide a configuration or create your default by saving your customer portal settings in test mode at https://dashboard.stripe.com/test/settings/billing/portal.",
			statusCode: 400,
		});
		const create = vi.fn().mockRejectedValue(unconfigured);
		const provider = createCustomersProvider(() => fakeStripe({ billingPortal: { sessions: { create } } }));
		const error = await provider.createPortalSession({ providerCustomerId: "cus_1", returnUrl: "https://x.example" }).catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(ProviderError);
		expect(error).toMatchObject({ isRetryable: false, providerCode: "portal_not_configured" });
		expect((error as Error).message).toContain("Customer Portal is not configured");
	});

	it("keeps other portal failures as they are", async () => {
		const create = vi.fn().mockRejectedValue(OUTAGE);
		const provider = createCustomersProvider(() => fakeStripe({ billingPortal: { sessions: { create } } }));
		await expect(provider.createPortalSession({ providerCustomerId: "cus_1", returnUrl: "https://x.example" })).rejects.toMatchObject({ isRetryable: true });
	});
});

describe("subscriptions provider", () => {
	const subscription = loadStripeObject<Stripe.Subscription>("subscription");

	it("retrieves a subscription and returns null when missing", async () => {
		const retrieve = vi.fn().mockResolvedValueOnce(subscription).mockRejectedValueOnce(NOT_FOUND);
		const provider = createSubscriptionsProvider(() => fakeStripe({ subscriptions: { retrieve } }));
		await expect(provider.retrieveSubscription(subscription.id)).resolves.toMatchObject({ subscriptionId: subscription.id });
		await expect(provider.retrieveSubscription("sub_gone")).resolves.toBeNull();
	});

	it("cancels at period end by updating the subscription", async () => {
		const update = vi.fn().mockResolvedValue({ ...subscription, cancel_at_period_end: true });
		const cancel = vi.fn();
		const provider = createSubscriptionsProvider(() => fakeStripe({ subscriptions: { update, cancel } }));
		const result = await provider.cancelSubscription("sub_1", { atPeriodEnd: true }, KEY);
		expect(update).toHaveBeenCalledWith("sub_1", { cancel_at_period_end: true }, { idempotencyKey: KEY });
		expect(cancel).not.toHaveBeenCalled();
		expect(result.cancelAtPeriodEnd).toBe(true);
	});

	it("cancels immediately through subscriptions.cancel", async () => {
		const update = vi.fn();
		const cancel = vi.fn().mockResolvedValue(subscription);
		const provider = createSubscriptionsProvider(() => fakeStripe({ subscriptions: { update, cancel } }));
		await provider.cancelSubscription("sub_1", { atPeriodEnd: false }, KEY);
		expect(cancel).toHaveBeenCalledWith("sub_1", undefined, { idempotencyKey: KEY });
		expect(update).not.toHaveBeenCalled();
	});

	it("retrieves an invoice with its payments expanded", async () => {
		const retrieve = vi.fn().mockResolvedValue(loadStripeObject<Stripe.Invoice>("invoiceSubscription"));
		const provider = createSubscriptionsProvider(() => fakeStripe({ invoices: { retrieve } }));
		await expect(provider.retrieveInvoice("in_1")).resolves.toMatchObject({ status: "paid", paymentIntentId: expect.stringMatching(/^pi_/) });
		expect(retrieve).toHaveBeenCalledWith("in_1", { expand: ["payments.data.payment.payment_intent"] });
	});

	it("returns null for a missing invoice", async () => {
		const retrieve = vi.fn().mockRejectedValue(NOT_FOUND);
		const provider = createSubscriptionsProvider(() => fakeStripe({ invoices: { retrieve } }));
		await expect(provider.retrieveInvoice("in_gone")).resolves.toBeNull();
	});
});

describe("describeStripeAccount", () => {
	it("reads the account id and display name", async () => {
		const retrieveCurrent = vi.fn().mockResolvedValue({ id: "acct_1", business_profile: { name: "Demo Shop" } });
		await expect(describeStripeAccount(() => fakeStripe({ accounts: { retrieveCurrent } }), "sk_test_abc")).resolves.toEqual({
			accountId: "acct_1",
			isLivemode: false,
			apiVersion: "2026-10-28.endive",
			keyKind: "secret",
			displayName: "Demo Shop",
		});
	});

	it.each([
		["sk_live_abc", true, "secret"],
		["rk_live_abc", true, "restricted"],
		["rk_test_abc", false, "restricted"],
		["weird", false, "unknown"],
	] as const)("derives livemode and key kind from %s", async (key, isLivemode, keyKind) => {
		const retrieveCurrent = vi.fn().mockResolvedValue({ id: "acct_1" });
		await expect(describeStripeAccount(() => fakeStripe({ accounts: { retrieveCurrent } }), key)).resolves.toMatchObject({ isLivemode, keyKind });
	});

	it("degrades to an unknown account when a restricted key lacks the permission", async () => {
		const retrieveCurrent = vi.fn().mockRejectedValue(stripeError("StripePermissionError", { message: "no permission", statusCode: 403 }));
		await expect(describeStripeAccount(() => fakeStripe({ accounts: { retrieveCurrent } }), "rk_live_abc")).resolves.toMatchObject({
			accountId: "unknown",
			displayName: null,
			isLivemode: true,
			keyKind: "restricted",
		});
	});

	it("still fails for an invalid key or an outage", async () => {
		const bad = vi.fn().mockRejectedValue(stripeError("StripeAuthenticationError", { message: "bad key", statusCode: 401 }));
		await expect(describeStripeAccount(() => fakeStripe({ accounts: { retrieveCurrent: bad } }), "sk_test_x")).rejects.toMatchObject({ isRetryable: false });
		const down = vi.fn().mockRejectedValue(OUTAGE);
		await expect(describeStripeAccount(() => fakeStripe({ accounts: { retrieveCurrent: down } }), "sk_test_x")).rejects.toMatchObject({ isRetryable: true });
	});
});

describe("createStripeProvider", () => {
	it("builds without touching the network or the key", () => {
		const provider = createStripeProvider({ secretKey: "", webhookSecret: null, integrationIdentifier: "x", appVersion: "0.0.0" });
		expect(provider.id).toBe("stripe");
	});

	it("reports a missing secret key as a permanent not-configured error on first use", async () => {
		const provider = createStripeProvider({ secretKey: "", webhookSecret: WEBHOOK_SECRET, integrationIdentifier: "x", appVersion: "0.0.0" });
		await expect(provider.catalog.retrieveProduct("prod_1")).rejects.toMatchObject({ providerCode: "not_configured", isRetryable: false });
	});

	it("is wired with a real SDK client for the given key", () => {
		const provider = createStripeProvider({ secretKey: SECRET_KEY, webhookSecret: null, integrationIdentifier: "x", appVersion: "0.0.0" });
		expect(provider.checkout).toBeDefined();
		expect(provider.webhooks).toBeDefined();
	});
});
