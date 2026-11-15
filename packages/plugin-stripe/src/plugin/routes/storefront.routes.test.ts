import { PluginRouteError, type PluginRoute } from "emdash";
import { beforeEach, describe, expect, it } from "vitest";

import { PLUGIN_ID } from "../../adapters/emdash/constants.js";
import { buildCollectionDefinitions } from "../../adapters/emdash/schema/collections.js";
import { PRICE_FIELD, PRODUCT_FIELD } from "../../adapters/emdash/schema/field-names.js";
import { resetEnsureSchemaMemo, type SchemaPort } from "../../adapters/emdash/schema/reconcile.js";
import { availabilityView, CART_HEADER, cartView, catalogProductView, checkoutStatusView, checkoutView, ROUTE } from "../../contracts/api.js";
import { commerceOptionsSchema, type CommerceOptionsInput } from "../../contracts/options.js";
import { createFakePaymentProvider, createFakePluginContext, createFakeRouteContext, type FakePaymentProvider, type FakePluginContext } from "../../testing/index.js";
import { resetContainerMemo } from "../container.js";
import { createStripeCommercePlugin } from "../index.js";
import { createReadySchemaPort } from "../../testing/fakes/schema-port.js";

const baseOptions = commerceOptionsSchema.parse({ supportedCurrencies: ["pln"] });
const definitions = buildCollectionDefinitions(baseOptions.collections, baseOptions.supportedCurrencies);

const allFieldsPort = (): SchemaPort => createReadySchemaPort(definitions);

interface Harness {
	base: FakePluginContext;
	provider: FakePaymentProvider;
	routes: Record<string, PluginRoute>;
	call(name: string, over?: Parameters<typeof createFakeRouteContext>[1]): Promise<unknown>;
	ids: { product: string; price: string; tracked: string; trackedPrice: string };
}

const harness = (options: CommerceOptionsInput = {}): Harness => {
	resetEnsureSchemaMemo();
	resetContainerMemo();
	const base = createFakePluginContext(definitions);
	const provider = createFakePaymentProvider();
	const plugin = createStripeCommercePlugin(options, {}, { createProvider: () => provider, createSchemaPort: async () => allFieldsPort(), relations: base.fakeRelations, env: { STRIPE_SECRET_KEY: "sk_test_x" } });
	const routes = plugin.routes as Record<string, PluginRoute>;

	const product = base.content.seedEntry("products", { [PRODUCT_FIELD.title]: "Mug" }, { status: "published", slug: "mug" });
	const price = base.content.seedEntry("prices", { [PRICE_FIELD.type]: "one_time", [PRICE_FIELD.unitAmount]: 1200, [PRICE_FIELD.currency]: "pln", [PRICE_FIELD.isDefault]: true }, { status: "published" });
	const tracked = base.content.seedEntry("products", { [PRODUCT_FIELD.title]: "Lamp", [PRODUCT_FIELD.hasVariants]: false, [PRODUCT_FIELD.trackInventory]: true }, { status: "published", slug: "lamp" });
	const trackedPrice = base.content.seedEntry("prices", { [PRICE_FIELD.type]: "one_time", [PRICE_FIELD.unitAmount]: 3000, [PRICE_FIELD.currency]: "pln", [PRICE_FIELD.isDefault]: true }, { status: "published" });

	// Prices link to their product through the relation (the fake relations share the fake content's entries).
	void base.fakeRelations.setParent("prices", price, PRICE_FIELD.product, product);
	void base.fakeRelations.setParent("prices", trackedPrice, PRICE_FIELD.product, tracked);

	return {
		base,
		provider,
		routes,
		ids: { product, price, tracked, trackedPrice },
		call: (name, over) => {
			const route = routes[name];
			if (!route) throw new Error(`No route ${name}`);
			return route.handler(createFakeRouteContext(base, over) as never);
		},
	};
};

const failure = async (promise: Promise<unknown>): Promise<PluginRouteError> => {
	try {
		await promise;
	} catch (error) {
		return error as PluginRouteError;
	}
	throw new Error("expected the route to fail");
};

const post = (input: unknown, headers: Record<string, string> = {}, ip?: string | null) => ({ method: "POST", input, headers, ...(ip === undefined ? {} : { ip }) });

describe("storefront routes (real route builder, fake plugin context)", () => {
	let h: Harness;
	beforeEach(() => {
		h = harness();
	});

	it("registers the storefront routes as public routes with the contract names, methods and cache headers", () => {
		for (const name of [ROUTE.catalogProducts, ROUTE.catalogProduct, ROUTE.catalogProductLegacy, ROUTE.catalogAvailability, ROUTE.cart, ROUTE.cartLines, ROUTE.checkout, ROUTE.checkoutStatus]) {
			expect(h.routes[name], name).toMatchObject({ public: true });
		}
		expect(h.routes[ROUTE.catalogProduct]).toMatchObject({ methods: ["GET"], cacheControl: "public, max-age=30" });
		expect(h.routes[ROUTE.catalogAvailability]).toMatchObject({ methods: ["GET"], cacheControl: "no-store" });
		expect(h.routes[ROUTE.cart]?.methods).toEqual(["GET"]);
		expect(h.routes[ROUTE.cartLines]?.methods).toEqual(["POST", "DELETE"]);
		expect(h.routes[ROUTE.checkout]?.methods).toEqual(["POST"]);
		expect(h.routes[ROUTE.checkoutStatus]?.methods).toEqual(["GET"]);
		expect(PLUGIN_ID).toBe("stripe-commerce");
	});

	describe("catalog", () => {
		it("serves a product and its availability in the contract shape", async () => {
			const product = await h.call(ROUTE.catalogProductLegacy, { input: { slug: "mug" } });
			expect(catalogProductView.parse(product)).toEqual(product);
			expect(product).toMatchObject({ slug: "mug", title: "Mug", prices: [{ id: h.ids.price, unitAmount: { amount: 1200, currency: "pln" }, isPurchasable: true }] });
			const availability = await h.call(ROUTE.catalogAvailability, { input: { priceIds: `${h.ids.price},ghost` } });
			expect(availabilityView.parse(availability)).toEqual(availability);
			expect(availability).toEqual({ prices: { [h.ids.price]: { isPurchasable: true, available: null }, ghost: { isPurchasable: false, available: null } } });
			expect(h.provider.calls).toEqual([]);
		});

		it("rejects bad input with 400 and an unknown slug with 404", async () => {
			expect(await failure(h.call(ROUTE.catalogProduct, { input: {} }))).toMatchObject({ code: "INVALID_INPUT", status: 400 });
			expect(await failure(h.call(ROUTE.catalogAvailability, { input: { priceIds: "" } }))).toMatchObject({ status: 400 });
			expect(await failure(h.call(ROUTE.catalogProduct, { input: { slug: "nope" } }))).toMatchObject({ code: "NOT_FOUND", status: 404 });
		});
	});

	describe("cart", () => {
		it("GET without an id starts a new cart; POST adds a line; GET with the header returns it; DELETE removes it", async () => {
			const empty = cartView.parse(await h.call(ROUTE.cart));
			expect(empty).toMatchObject({ isNew: true, lines: [] });

			const added = cartView.parse(await h.call(ROUTE.cartLines, post({ priceId: h.ids.price, quantity: 2 })));
			expect(added).toMatchObject({ isNew: true, itemCount: 2, subtotal: { amount: 2400, currency: "pln" }, isCheckoutReady: true });
			const header = { [CART_HEADER]: added.cartId };

			const read = cartView.parse(await h.call(ROUTE.cart, { headers: header }));
			expect(read).toMatchObject({ cartId: added.cartId, isNew: false, itemCount: 2 });
			const more = cartView.parse(await h.call(ROUTE.cartLines, post({ priceId: h.ids.price, quantity: 1, mode: "add" }, header)));
			expect(more.itemCount).toBe(3);

			// A DELETE carries its input in the query string, which EmDash parses into `input`.
			const removed = cartView.parse(await h.call(ROUTE.cartLines, { method: "DELETE", input: { priceId: h.ids.price }, headers: header }));
			expect(removed).toMatchObject({ cartId: added.cartId, itemCount: 0, lines: [] });
		});

		it("accepts the cart id from the cookie and ignores a malformed one", async () => {
			const added = cartView.parse(await h.call(ROUTE.cartLines, post({ priceId: h.ids.price, quantity: 1 })));
			const byCookie = cartView.parse(await h.call(ROUTE.cart, { headers: { cookie: `emdash_commerce_cart=${added.cartId}` } }));
			expect(byCookie.cartId).toBe(added.cartId);
			expect((cartView.parse(await h.call(ROUTE.cart, { headers: { [CART_HEADER]: "../nope" } }))).isNew).toBe(true);
		});

		it("answers 400 for a body that is not a line and for a DELETE without a price, 404 for an unknown price", async () => {
			expect(await failure(h.call(ROUTE.cartLines, post({ priceId: h.ids.price, quantity: -1 })))).toMatchObject({ code: "INVALID_INPUT", status: 400 });
			expect(await failure(h.call(ROUTE.cartLines, post({ priceId: h.ids.price })))).toMatchObject({ status: 400 });
			expect(await failure(h.call(ROUTE.cartLines, { method: "DELETE", input: {} }))).toMatchObject({ status: 400 });
			expect(await failure(h.call(ROUTE.cartLines, post({ priceId: "ghost", quantity: 1 })))).toMatchObject({ code: "NOT_FOUND", status: 404 });
		});

		it("rate limits cart writes per IP and route, not reads, and not another IP", async () => {
			h = harness({ rateLimits: { cartWritesPerMinute: 2 } });
			const line = { priceId: h.ids.price, quantity: 1 };
			await h.call(ROUTE.cartLines, post(line, {}, "198.51.100.1"));
			await h.call(ROUTE.cartLines, post(line, {}, "198.51.100.1"));
			expect(await failure(h.call(ROUTE.cartLines, post(line, {}, "198.51.100.1")))).toMatchObject({ code: "RATE_LIMITED", status: 429 });
			await expect(h.call(ROUTE.cartLines, post(line, {}, "198.51.100.2"))).resolves.toBeDefined();
			await expect(h.call(ROUTE.cart, { ip: "198.51.100.1" })).resolves.toBeDefined();
		});

		it("never stores the caller's IP with the cart", async () => {
			const added = cartView.parse(await h.call(ROUTE.cartLines, post({ priceId: h.ids.price, quantity: 1 }, {}, "198.51.100.77")));
			const stored = await h.base.fakeStorage["commerce_carts"]!.get(added.cartId);
			expect(JSON.stringify(stored)).not.toContain("198.51.100.77");
			expect(stored).toMatchObject({ context: { userAgent: "vitest" } });
		});
	});

	describe("checkout", () => {
		const cartHeader = async (priceId: string, quantity = 1) => {
			const added = cartView.parse(await h.call(ROUTE.cartLines, post({ priceId, quantity })));
			return { [CART_HEADER]: added.cartId };
		};

		it("creates a hosted session through the real services, then reports its status", async () => {
			const headers = await cartHeader(h.ids.price, 2);
			const view = checkoutView.parse(await h.call(ROUTE.checkout, post({ email: "jane@example.com" }, headers)));
			expect(view).toMatchObject({ uiMode: "hosted", clientSecret: null, url: expect.stringContaining("checkout.stripe.test") });
			const [call] = h.provider.callsOf("createSession");
			expect(call?.idempotencyKey).toMatch(/^stripe-commerce:checkout:/);
			expect(JSON.stringify(call?.args)).not.toContain("payment_method_types");
			expect(call?.args).toMatchObject({ mode: "payment", uiMode: "hosted", successUrl: "https://shop.example/checkout/success?session_id={CHECKOUT_SESSION_ID}" });

			const again = checkoutView.parse(await h.call(ROUTE.checkout, post({}, headers)));
			expect(again).toEqual(view);
			expect(h.provider.callsOf("createSession")).toHaveLength(1);

			const status = checkoutStatusView.parse(await h.call(ROUTE.checkoutStatus, { input: { session_id: view.sessionId } }));
			expect(status).toEqual({ status: "open", paymentStatus: "unpaid", orderNumber: null, orderStatus: null, maskedEmail: "j***@example.com" });

			const cart = cartView.parse(await h.call(ROUTE.cart, { headers }));
			expect(cart.status).toBe("checkout_open");
		});

		it("embedded mode returns the client secret and nothing else sensitive in status", async () => {
			const headers = await cartHeader(h.ids.price);
			const view = checkoutView.parse(await h.call(ROUTE.checkout, post({ uiMode: "embedded" }, headers)));
			expect(view).toMatchObject({ uiMode: "embedded", url: null, clientSecret: expect.any(String) });
			const status = await h.call(ROUTE.checkoutStatus, { input: { session_id: view.sessionId } });
			expect(JSON.stringify(status)).not.toContain(view.clientSecret as string);
		});

		it("answers 409 with the issues for a cart that is not ready, 404 without a cart, 400 for bad input", async () => {
			const out = await cartHeader(h.ids.trackedPrice, 1);
			const notReady = await failure(h.call(ROUTE.checkout, post({}, out)));
			expect(notReady).toMatchObject({ code: "CART_NOT_CHECKOUT_READY", status: 409 });
			expect(notReady.details).toMatchObject({ issues: [{ code: "OUT_OF_STOCK", priceId: h.ids.trackedPrice }] });
			expect(await failure(h.call(ROUTE.checkout, post({})))).toMatchObject({ code: "NOT_FOUND", status: 404 });
			expect(await failure(h.call(ROUTE.checkout, post({ uiMode: "popup" }, out)))).toMatchObject({ code: "INVALID_INPUT", status: 400 });
			expect(await failure(h.call(ROUTE.checkout, post({ email: "nope" }, out)))).toMatchObject({ status: 400 });
		});

		it("maps a provider outage to 502 and keeps the cart usable", async () => {
			const headers = await cartHeader(h.ids.price);
			h.provider.failNext("createSession");
			expect(await failure(h.call(ROUTE.checkout, post({}, headers)))).toMatchObject({ code: "PROVIDER_ERROR", status: 502 });
			await expect(h.call(ROUTE.checkout, post({}, headers))).resolves.toMatchObject({ uiMode: "hosted" });
		});

		it("rate limits checkout per IP", async () => {
			h = harness({ rateLimits: { checkoutPerMinute: 1 } });
			const headers = await cartHeader(h.ids.price);
			await h.call(ROUTE.checkout, post({}, headers, "198.51.100.5"));
			expect(await failure(h.call(ROUTE.checkout, post({}, headers, "198.51.100.5")))).toMatchObject({ code: "RATE_LIMITED", status: 429 });
		});

		it("status answers 404 for an unknown session and 400 for a missing id", async () => {
			expect(await failure(h.call(ROUTE.checkoutStatus, { input: { session_id: "cs_unknown" } }))).toMatchObject({ status: 404 });
			expect(await failure(h.call(ROUTE.checkoutStatus, { input: {} }))).toMatchObject({ status: 400 });
		});
	});
});
