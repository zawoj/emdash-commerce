import type { PluginRoute, RouteContext } from "emdash";
import { PluginRouteError } from "emdash";
import { beforeEach, describe, expect, it } from "vitest";

import { resetEnsureSchemaMemo } from "../../adapters/emdash/schema/reconcile.js";
import { buildCollectionDefinitions } from "../../adapters/emdash/schema/collections.js";
import { ORDER_FIELD } from "../../adapters/emdash/schema/field-names.js";
import { ROUTE } from "../../contracts/api.js";
import { commerceOptionsSchema, SETTINGS_KEY } from "../../contracts/options.js";
import type { ProviderWebhookEvent } from "../../ports/payment-provider.js";
import { createFakePaymentProvider, FAKE_WEBHOOK_SIGNATURE, webhookEvent } from "../../testing/fake-provider.js";
import { createFakePluginContext, createFakeRouteContext } from "../../testing/index.js";
import { createRouteBuilder } from "../route-builder.js";
import { resetContainerMemo } from "../container.js";
import { SIGNATURE_HEADER, webhookRoutes } from "./webhook.js";
import { createReadySchemaPort } from "../../testing/fakes/schema-port.js";

const options = commerceOptionsSchema.parse({});
const definitions = buildCollectionDefinitions(options.collections, options.supportedCurrencies);
const SETTINGS = { [SETTINGS_KEY.stripeSecretKey]: "sk_test_route", [SETTINGS_KEY.stripeWebhookSecret]: "whsec_route", [SETTINGS_KEY.accessTokenSecret]: "tok" };

beforeEach(() => {
	resetEnsureSchemaMemo();
	resetContainerMemo();
});

const setup = (settings: Record<string, string> = SETTINGS) => {
	const provider = createFakePaymentProvider();
	const base = createFakePluginContext(definitions, { settings });
	const builder = createRouteBuilder(options, {}, {
		createProvider: () => provider,
		createSchemaPort: async () => createReadySchemaPort(definitions),
		relations: base.fakeRelations,
		env: {},
	});
	const route = webhookRoutes(builder)[ROUTE.webhook] as PluginRoute;
	const call = (body: string, signature: string | null = FAKE_WEBHOOK_SIGNATURE): Promise<unknown> => {
		const ctx = createFakeRouteContext(base, { method: "POST", headers: signature ? { [SIGNATURE_HEADER]: signature } : {}, input: body }) as RouteContext;
		return route.handler(ctx);
	};
	return { provider, route, base, call };
};

const send = (event: ProviderWebhookEvent) => JSON.stringify(event);
const caught = async (promise: Promise<unknown>): Promise<PluginRouteError> => {
	try {
		await promise;
	} catch (error) {
		return error as PluginRouteError;
	}
	throw new Error("expected the route to throw");
};

describe("webhook route declaration", () => {
	it("is a public POST that reads the raw text body and declares the signature header", () => {
		const { route } = setup();
		expect(route).toMatchObject({ public: true, methods: ["POST"], request: { body: "text", headers: ["stripe-signature"] } });
	});
});

describe("webhook route answers", () => {
	it("503 when no signing secret is configured", async () => {
		const { call } = setup({ [SETTINGS_KEY.stripeSecretKey]: "sk_test_route" });
		const error = await caught(call(send(webhookEvent({ kind: "unsupported" }))));
		expect(error).toMatchObject({ code: "NOT_CONFIGURED", status: 503 });
	});

	it("400 when the signature does not verify, and nothing is stored", async () => {
		const { call, base } = setup();
		const body = send(webhookEvent({ kind: "unsupported" }, { eventId: "evt_bad" }));
		expect(await caught(call(body, "wrong"))).toMatchObject({ code: "INVALID_SIGNATURE", status: 400 });
		expect(await caught(call(body, null))).toMatchObject({ code: "INVALID_SIGNATURE", status: 400 });
		expect(await base.fakeStorage.webhook_inbox!.get("evt_bad")).toBeNull();
	});

	it("200 for a handled event, marks it processed and advances the cursor", async () => {
		const { call, base } = setup();
		const event = webhookEvent({ kind: "product_changed", product: { providerId: "prod_x", name: "X", isActive: true, entityKey: null, updatedAt: 1 } }, { eventId: "evt_ok", created: 1_800_000_000 });
		expect(await call(send(event))).toEqual({ received: true });
		expect(await base.fakeStorage.webhook_inbox!.get("evt_ok")).toMatchObject({ status: "processed", attempts: 1, source: "webhook" });
		expect(await base.kv.get("state:webhook-cursor")).toBe(1_800_000_000);
	});

	it("200 with duplicate for an event that was already processed or ignored, without running it again", async () => {
		const { call, provider } = setup();
		const event = webhookEvent({ kind: "unsupported" }, { eventId: "evt_dup", type: "charge.succeeded" });
		expect(await call(send(event))).toEqual({ received: true, ignored: true });
		expect(await call(send(event))).toEqual({ received: true, duplicate: true });
		expect(await call(send(event))).toEqual({ received: true, duplicate: true });
		expect(provider.calls).toHaveLength(0);
	});

	it("500 when handling fails, keeps the event failed with its payload for the retry, and 200 once it succeeds", async () => {
		const { call, provider, base } = setup();
		const event = webhookEvent({ kind: "checkout_completed", sessionId: "cs_missing" }, { eventId: "evt_fail", type: "checkout.session.completed" });
		const error = await caught(call(send(event)));
		expect(error).toMatchObject({ status: 500 });
		const stored = (await base.fakeStorage.webhook_inbox!.get("evt_fail")) as { status: string; attempts: number; payload: string; lastError: string; nextAttemptAt: string };
		expect(stored).toMatchObject({ status: "failed", attempts: 1, lastError: expect.stringContaining("could not be retrieved") });
		expect(JSON.parse(stored.payload)).toMatchObject({ eventId: "evt_fail" });
		expect(stored.nextAttemptAt).toBeTruthy();
		expect(provider.callsOf("retrieveSession")).toHaveLength(1);

		// Stripe's own retry of the same event while the failure is stored: processed again, not "duplicate".
		const second = await caught(call(send(event)));
		expect(second).toMatchObject({ status: 500 });
		expect((await base.fakeStorage.webhook_inbox!.get("evt_fail")) as { attempts: number }).toMatchObject({ attempts: 2 });
	});

	it("settles a checkout end to end against the real content and storage adapters", async () => {
		const { call, provider, base } = setup();
		const product = await provider.catalog.createProduct({ entityKey: "product:x", name: "Mug", description: null, imageUrls: [], isActive: true, taxCode: null, extraMetadata: {} }, "k1");
		const price = await provider.catalog.createPrice(
			{ entityKey: "price:x", providerProductId: product.providerId, unitAmount: 1900, currency: "pln" as never, recurring: null, taxBehavior: "unspecified", nickname: null, lookupKey: null },
			"k2",
		);
		const created = await provider.checkout.createSession(
			{
				checkoutId: "co_route", cartId: "c".repeat(32), mode: "payment", uiMode: "hosted", currency: "pln" as never, lines: [{ providerPriceId: price.providerId, quantity: 3 }],
				customerEmail: "Route@Example.com", providerCustomerId: null, successUrl: "https://shop.example/ok", cancelUrl: "https://shop.example/c", returnUrl: null, expiresAt: new Date().toISOString(),
				locale: null, allowPromotionCodes: false, billingAddressCollection: "required", shippingAddressCountries: [], shippingRates: [], collectPhone: false, automaticTax: false, trialDays: null, extraMetadata: {},
			},
			"k3",
		);
		provider.completeSession(created.sessionId);
		const event = webhookEvent({ kind: "checkout_completed", sessionId: created.sessionId }, { eventId: "evt_settle", type: "checkout.session.completed" });
		expect(await call(send(event))).toEqual({ received: true });
		expect(await call(send(webhookEvent({ kind: "checkout_async_succeeded", sessionId: created.sessionId }, { eventId: "evt_settle2", type: "checkout.session.async_payment_succeeded" })))).toEqual({ received: true });

		const orders = await base.content.list(options.collections.orders, { limit: 10 });
		expect(orders.items).toHaveLength(1);
		const order = orders.items[0]!;
		expect(order.data[ORDER_FIELD.paymentStatus]).toBe("paid");
		expect(order.data[ORDER_FIELD.orderStatus]).toBe("open");
		expect(order.data[ORDER_FIELD.email]).toBe("Route@Example.com");
		const customers = await base.content.list(options.collections.customers, { limit: 10 });
		expect(customers.items).toHaveLength(1);
		expect(customers.items[0]!.data).toMatchObject({ email: "route@example.com", order_count: 1 });
		const payments = await base.content.list(options.collections.payments, { limit: 10 });
		expect(payments.items).toHaveLength(1);
	});
});
