import type { PluginRoute, RouteContext } from "emdash";
import { PluginRouteError } from "emdash";

import { buildCollectionDefinitions } from "../adapters/emdash/schema/collections.js";
import { PRICE_FIELD, PRODUCT_FIELD } from "../adapters/emdash/schema/field-names.js";
import { resetEnsureSchemaMemo, type SchemaPort } from "../adapters/emdash/schema/reconcile.js";
import type { CommerceExtensions } from "../contracts/extensions.js";
import { commerceOptionsSchema, SETTINGS_KEY, type CommerceOptionsInput } from "../contracts/options.js";
import { ROUTE } from "../contracts/api.js";
import { FAKE_WEBHOOK_SIGNATURE, createFakePaymentProvider, webhookEvent, type FakePaymentProvider } from "../testing/fake-provider.js";
import { createFakePluginContext, createFakeRouteContext, type FakePluginContext } from "../testing/index.js";
import { createContainer, resetContainerMemo, type CommerceContainer } from "./container.js";
import { createStripeCommercePlugin } from "./index.js";
import { createReadySchemaPort } from "../testing/fakes/schema-port.js";

/**
 * Harness for the operations surface: the real plugin (real route builder, real adapters on fake content and
 * storage) with a fake payment provider. `seedPaidOrder` produces an order the way production does, through the
 * webhook route, so refunds and token links run against real settlement output.
 */

export const SECRET_KEY = "sk_test_ops_secret_value_1234";
export const WEBHOOK_SECRET = "whsec_ops_secret_value";
export const TOKEN_SECRET = "ops-token-secret";

const FULL_SETTINGS = {
	[SETTINGS_KEY.stripeSecretKey]: SECRET_KEY,
	[SETTINGS_KEY.stripeWebhookSecret]: WEBHOOK_SECRET,
	[SETTINGS_KEY.accessTokenSecret]: TOKEN_SECRET,
};

export interface FakeCronTask {
	name: string;
	schedule: string;
}

export interface OpsHarness {
	base: FakePluginContext;
	provider: FakePaymentProvider;
	routes: Record<string, PluginRoute>;
	plugin: ReturnType<typeof createStripeCommercePlugin>;
	cronTasks: FakeCronTask[];
	container(): CommerceContainer;
	call(name: string, over?: CallOptions): Promise<unknown>;
	/** The route's context, for tests that call a handler directly. */
	context(over?: CallOptions): RouteContext;
	seedPaidOrder(over?: { email?: string; quantity?: number; unitAmount?: number }): Promise<{ orderId: string; orderNumber: string; sessionId: string; paymentIntentId: string }>;
	seedProduct(over?: { tracked?: boolean; stock?: number }): { productId: string; priceId: string };
}

export interface CallOptions {
	method?: string;
	input?: unknown;
	headers?: Record<string, string>;
	ip?: string | null;
	user?: { id: string; email: string; role?: number } | null;
}

export const failure = async (promise: Promise<unknown>): Promise<PluginRouteError> => {
	try {
		await promise;
	} catch (error) {
		return error as PluginRouteError;
	}
	throw new Error("expected the route to fail");
};

export const createOpsHarness = (
	input: { options?: CommerceOptionsInput; settings?: Record<string, string>; extensions?: CommerceExtensions; withEmail?: boolean } = {},
): OpsHarness => {
	resetEnsureSchemaMemo();
	resetContainerMemo();
	const parsed = commerceOptionsSchema.parse(input.options ?? {});
	const definitions = buildCollectionDefinitions(parsed.collections, parsed.supportedCurrencies);
	const port: SchemaPort = createReadySchemaPort(definitions);
	const base = createFakePluginContext(definitions, { settings: input.settings ?? FULL_SETTINGS });
	const cronTasks: FakeCronTask[] = [];
	Object.assign(base, {
		cron: {
			async schedule(name: string, opts: { schedule: string }) {
				const index = cronTasks.findIndex((task) => task.name === name);
				if (index >= 0) cronTasks.splice(index, 1);
				cronTasks.push({ name, schedule: opts.schedule });
			},
			async cancel(name: string) {
				const index = cronTasks.findIndex((task) => task.name === name);
				if (index >= 0) cronTasks.splice(index, 1);
			},
			async list() {
				return cronTasks.map((task) => ({ ...task, nextRunAt: "2026-01-15T12:05:00.000Z", lastRunAt: null }));
			},
		},
	});
	if (input.withEmail === false) delete (base as { email?: unknown }).email;
	const provider = createFakePaymentProvider();
	const deps = { createProvider: () => provider, createSchemaPort: async () => port, relations: base.fakeRelations, env: {} };
	const plugin = createStripeCommercePlugin(input.options ?? {}, input.extensions ?? {}, deps);
	const routes = plugin.routes as Record<string, PluginRoute>;

	const context = (over: CallOptions = {}): RouteContext => {
		const ctx = createFakeRouteContext(base, { method: over.method ?? "POST", input: over.input, headers: over.headers, ...(over.ip === undefined ? {} : { ip: over.ip }) });
		return (over.user === null ? ctx : { ...ctx, user: { name: null, role: 50, createdAt: "2026-01-01T00:00:00.000Z", ...(over.user ?? { id: "usr_admin", email: "admin@example.com" }) } }) as RouteContext;
	};
	const call: OpsHarness["call"] = (name, over = {}) => {
		const route = routes[name];
		if (!route) throw new Error(`No route ${name}`);
		return route.handler(context(over) as never) as Promise<unknown>;
	};
	let counter = 0;
	const sendWebhook = (event: ReturnType<typeof webhookEvent>) =>
		routes[ROUTE.webhook]!.handler(createFakeRouteContext(base, { method: "POST", headers: { "stripe-signature": FAKE_WEBHOOK_SIGNATURE }, input: JSON.stringify(event) }) as never);

	return {
		base,
		provider,
		routes,
		plugin,
		cronTasks,
		context,
		call,
		container: () => createContainer(base, parsed, input.extensions ?? {}, deps),
		seedProduct(over = {}) {
			counter += 1;
			const productId = base.content.seedEntry("products", { [PRODUCT_FIELD.title]: `Lamp ${counter}`, [PRODUCT_FIELD.hasVariants]: false, [PRODUCT_FIELD.trackInventory]: over.tracked ?? true }, { status: "published", slug: `lamp-${counter}` });
			const priceId = base.content.seedEntry(
				"prices",
				{ [PRICE_FIELD.type]: "one_time", [PRICE_FIELD.unitAmount]: 3000, [PRICE_FIELD.currency]: "pln", [PRICE_FIELD.isDefault]: true },
				{ status: "published" },
			);
			void base.fakeRelations.setParent("prices", priceId, PRICE_FIELD.product, productId);
			return { productId, priceId };
		},
		async seedPaidOrder(over = {}) {
			counter += 1;
			const product = await provider.catalog.createProduct({ entityKey: `product:x${counter}`, name: "Mug", description: null, imageUrls: [], isActive: true, taxCode: null, extraMetadata: {} }, `k-prod-${counter}`);
			const price = await provider.catalog.createPrice(
				{ entityKey: `price:x${counter}`, providerProductId: product.providerId, unitAmount: over.unitAmount ?? 1900, currency: "pln" as never, recurring: null, taxBehavior: "unspecified", nickname: null, lookupKey: null },
				`k-price-${counter}`,
			);
			const created = await provider.checkout.createSession(
				{
					checkoutId: `co_ops_${counter}`, cartId: "c".repeat(32), mode: "payment", uiMode: "hosted", currency: "pln" as never, lines: [{ providerPriceId: price.providerId, quantity: over.quantity ?? 3 }],
					customerEmail: over.email ?? "Buyer@Example.com", providerCustomerId: null, successUrl: "https://shop.example/ok", cancelUrl: "https://shop.example/c", returnUrl: null, expiresAt: new Date().toISOString(),
					locale: null, allowPromotionCodes: false, billingAddressCollection: "required", shippingAddressCountries: [], shippingRates: [], collectPhone: false, automaticTax: false, trialDays: null, extraMetadata: {},
				},
				`k-session-${counter}`,
			);
			const session = provider.completeSession(created.sessionId);
			await sendWebhook(webhookEvent({ kind: "checkout_completed", sessionId: created.sessionId }, { eventId: `evt_ops_${counter}`, type: "checkout.session.completed" }));
			const orders = await container().orders.list({ cursor: null, limit: 100 });
			const order = orders.items.find((candidate) => candidate.stripe.checkoutSessionId === created.sessionId);
			if (!order) throw new Error("the order was not created");
			return { orderId: order.id, orderNumber: order.orderNumber, sessionId: created.sessionId, paymentIntentId: session.paymentIntentId! };
		},
	};

	function container(): CommerceContainer {
		return createContainer(base, parsed, input.extensions ?? {}, deps);
	}
};
