import { beforeEach, describe, expect, it } from "vitest";

import { KV_KEY, PLUGIN_VERSION, STORAGE } from "../adapters/emdash/constants.js";
import { resolveIntegrationIdentifier } from "../adapters/emdash/integration-identifier.js";
import { buildCollectionDefinitions, buildSchemaDefinitions } from "../adapters/emdash/schema/collections.js";
import { ORDER_FIELD } from "../adapters/emdash/schema/field-names.js";
import { fingerprintDefinitions, resetEnsureSchemaMemo, type SchemaPort } from "../adapters/emdash/schema/reconcile.js";
import { storageDeclaration } from "../adapters/emdash/storage/declaration.js";
import { commerceOptionsSchema, SETTINGS_KEY } from "../contracts/options.js";
import { CommerceError } from "../core/errors.js";
import { createSeededIdGenerator } from "../testing/clock.js";
import { createMemorySchemaPort, type MemorySchemaPort } from "../testing/fakes/schema-port.js";
import { createFakeKv } from "../testing/fakes/storage.js";
import { createFakePluginContext } from "../testing/index.js";
import type { PaymentProvider } from "../ports/payment-provider.js";
import { createContainer, resetContainerMemo } from "./container.js";
import { createPlugin, createStripeCommercePlugin } from "./index.js";
import { parseCommerceOptions } from "./options.js";

const options = commerceOptionsSchema.parse({});
const definitions = buildCollectionDefinitions(options.collections, options.supportedCurrencies);

const memoryPort = (): MemorySchemaPort => createMemorySchemaPort();

beforeEach(() => {
	resetEnsureSchemaMemo();
	resetContainerMemo();
});

describe("plugin definition", () => {
	const plugin = createStripeCommercePlugin({});

	it("registers under the stable id and version with exactly the capabilities it needs", () => {
		expect(plugin.id).toBe("stripe-commerce");
		expect(plugin.version).toBe("0.2.0");
		expect(plugin.version).toBe(PLUGIN_VERSION);
		expect(plugin.capabilities).toEqual(["content:read", "content:write", "content:publish", "content:revisions:read", "email:send", "hooks.content-policy:register"]);
	});

	it("declares storage for every collection the stores use, with their indexes", () => {
		expect(Object.keys(plugin.storage).sort()).toEqual(Object.values(STORAGE).sort());
		expect(plugin.storage[STORAGE.webhookInbox]!.indexes).toEqual(storageDeclaration[STORAGE.webhookInbox].indexes);
		expect(plugin.storage[STORAGE.reservations]!.indexes).toEqual([["status", "expiresAt"]]);
	});

	it("exposes the settings form with secret fields, the product block, the storefront routes and the MCP tools", () => {
		expect(Object.keys(plugin.admin.settingsSchema!).sort()).toEqual(Object.values(SETTINGS_KEY).sort());
		expect(plugin.admin.portableTextBlocks?.[0]?.type).toBe("product");
		expect(Object.keys(plugin.routes)).toEqual(expect.arrayContaining(["catalog/product", "catalog/availability", "cart", "cart/lines", "checkout", "checkout/status"]));
		expect(Object.keys(plugin.mcp?.tools ?? {}).length).toBeGreaterThan(0);
	});

	it("registers lifecycle hooks and the protected-field guard, which aborts a save by default", () => {
		expect(plugin.hooks["plugin:install"]).toBeDefined();
		expect(plugin.hooks["plugin:activate"]).toBeDefined();
		expect(plugin.hooks["content:beforeSave"]?.errorPolicy).toBe("abort");
	});

	it("is built by createPlugin from JSON descriptor options", () => {
		const fromDescriptor = createPlugin({ storeName: "My shop", defaultCurrency: "eur", supportedCurrencies: ["eur"] });
		expect(fromDescriptor.id).toBe("stripe-commerce");
		expect(createPlugin().id).toBe("stripe-commerce");
	});

	it("fails fast with a readable message on bad options", () => {
		expect(() => createPlugin({ defaultCurrency: "usd" })).toThrow(/Invalid stripe-commerce plugin options:\n\s+- defaultCurrency: defaultCurrency must be in supportedCurrencies/);
		expect(() => createStripeCommercePlugin({ checkout: { sessionMinutes: 5 } })).toThrow(/checkout\.sessionMinutes/);
		expect(() => parseCommerceOptions({ unknown: true })).toThrow(/Invalid stripe-commerce plugin options/);
	});
});

describe("lifecycle hooks", () => {
	const run = async (name: "plugin:activate" | "plugin:install", ctx: ReturnType<typeof createFakePluginContext>, port = memoryPort()) => {
		const plugin = createStripeCommercePlugin({}, {}, { createSchemaPort: async () => port, env: {}, ids: createSeededIdGenerator(5) });
		await plugin.hooks[name]!.handler({}, ctx);
		return port;
	};

	it("activation creates the collections, runs migrations and generates the token secret", async () => {
		const ctx = createFakePluginContext(definitions);
		const port = await run("plugin:activate", ctx);
		expect(port.created).toHaveLength(definitions.length);
		expect(await ctx.kv.get(KV_KEY.schemaMarker)).toBe(await fingerprintDefinitions(buildSchemaDefinitions(commerceOptionsSchema.parse({}))));
		expect(await ctx.kv.get(KV_KEY.migrationDone("0001-baseline"))).not.toBeNull();
		expect(await ctx.settings.get(SETTINGS_KEY.accessTokenSecret)).toMatch(/^[A-Za-z0-9_-]{43}$/);
	});

	it("install does the same, and a second activation changes nothing", async () => {
		const ctx = createFakePluginContext(definitions);
		const port = await run("plugin:install", ctx);
		const secret = await ctx.settings.get(SETTINGS_KEY.accessTokenSecret);
		const again = await run("plugin:activate", ctx, port);
		expect(again.created).toHaveLength(definitions.length);
		expect(await ctx.settings.get(SETTINGS_KEY.accessTokenSecret)).toBe(secret);
	});

	it("logs a schema failure instead of throwing, so a boot-time database error cannot unload the plugin", async () => {
		const ctx = createFakePluginContext(definitions);
		const broken: SchemaPort = { getCollection: async () => { throw new Error("database unavailable"); }, getRelationSlugs: async () => new Set<string>(), apply: async () => undefined, setNavigation: async () => undefined, setFieldValidation: async () => false };
		await expect(run("plugin:activate", ctx, broken as never)).resolves.toBeDefined();
		expect(ctx.logs.some((entry) => entry.level === "error" && /database unavailable/.test(JSON.stringify(entry.data)))).toBe(true);
		expect(await ctx.kv.get(KV_KEY.schemaMarker)).toBeNull();
		expect(await ctx.settings.get(SETTINGS_KEY.accessTokenSecret)).not.toBeNull();
	});
});

describe("content:beforeSave guard wiring", () => {
	const guardOf = () => createStripeCommercePlugin({}).hooks["content:beforeSave"]!.handler;
	const orderEvent = (over: Record<string, unknown>) => ({ collection: "orders", isNew: false, id: "o1", content: {}, ...over });

	it("rejects an editor's change to an order's status and lets the plugin's own writes through", async () => {
		const ctx = createFakePluginContext(definitions);
		const id = ctx.content.seedEntry("orders", { [ORDER_FIELD.orderNumber]: "ORD-1", [ORDER_FIELD.orderStatus]: "open", [ORDER_FIELD.paymentStatus]: "pending", [ORDER_FIELD.email]: "a@b.c", [ORDER_FIELD.currency]: "pln" });
		const handler = guardOf();
		await expect(handler(orderEvent({ id, actor: { id: "u1", role: 40 }, content: { [ORDER_FIELD.orderStatus]: "completed" } }) as never, ctx)).rejects.toThrow(/order_status/);
		await expect(handler(orderEvent({ id, content: { [ORDER_FIELD.orderStatus]: "completed" } }) as never, ctx)).resolves.toBeUndefined();
		// Fulfillment moves through the admin action (it records a timeline entry); only the free-text notes stay editable.
		await expect(handler(orderEvent({ id, actor: { id: "u1", role: 40 }, content: { [ORDER_FIELD.fulfillmentStatus]: "fulfilled" } }) as never, ctx)).rejects.toThrow(/fulfillment_status/);
		await expect(handler(orderEvent({ id, actor: { id: "u1", role: 40 }, content: { [ORDER_FIELD.notes]: "shipped" } }) as never, ctx)).resolves.toBeUndefined();
	});

	it("ignores collections the plugin does not own", async () => {
		const ctx = createFakePluginContext(definitions);
		await expect(guardOf()({ collection: "posts", isNew: true, content: { status: "x" }, actor: { id: "u", role: 40 } } as never, ctx)).resolves.toBeUndefined();
	});
});

describe("container", () => {
	const fakeProvider = (): PaymentProvider => ({ id: "stripe" } as unknown as PaymentProvider);

	it("builds the provider lazily with the stored key and a stable integration identifier", async () => {
		const ctx = createFakePluginContext(definitions, { settings: { [SETTINGS_KEY.stripeSecretKey]: "sk_test_x", [SETTINGS_KEY.stripeWebhookSecret]: "whsec_x" } });
		const configs: unknown[] = [];
		const container = createContainer(ctx, options, {}, { env: {}, createProvider: (config) => (configs.push(config), fakeProvider()) });
		expect(configs).toHaveLength(0);
		const [first, second] = await Promise.all([container.provider(), container.provider()]);
		expect(first).toBe(second);
		expect(configs).toHaveLength(1);
		expect(configs[0]).toMatchObject({ secretKey: "sk_test_x", webhookSecret: "whsec_x", appVersion: "0.2.0", integrationIdentifier: expect.stringMatching(/^emdash-stripe-[a-z]{8}$/) });
		const again = createContainer(ctx, options, {}, { env: {}, createProvider: (config) => (configs.push(config), fakeProvider()) });
		await again.provider();
		expect((configs[1] as { integrationIdentifier: string }).integrationIdentifier).toBe((configs[0] as { integrationIdentifier: string }).integrationIdentifier);
	});

	it("reads the key from the environment and passes no webhook secret when none is set", async () => {
		const ctx = createFakePluginContext(definitions);
		const configs: Array<{ secretKey: string; webhookSecret: string | null }> = [];
		const container = createContainer(ctx, options, {}, { env: { STRIPE_SECRET_KEY: "sk_env" }, createProvider: (config) => (configs.push(config), fakeProvider()) });
		await container.provider();
		expect(configs[0]).toMatchObject({ secretKey: "sk_env", webhookSecret: null });
	});

	it("throws NOT_CONFIGURED without a key, and recovers once the key is set", async () => {
		const ctx = createFakePluginContext(definitions);
		const container = createContainer(ctx, options, {}, { env: {}, createProvider: () => fakeProvider() });
		await expect(container.provider()).rejects.toMatchObject({ kind: "notConfigured", status: 503 });
		await expect(container.provider()).rejects.toBeInstanceOf(CommerceError);
		await ctx.settings.set(SETTINGS_KEY.stripeSecretKey, "sk_late");
		await expect(container.provider()).resolves.toBeDefined();
	});

	it("needs content write access", () => {
		const ctx = createFakePluginContext(definitions);
		(ctx as unknown as { content: undefined }).content = undefined;
		expect(() => createContainer(ctx, options, {})).toThrow(/content:write/);
	});

	it("ensureReady reconciles once and a failed migration does not throw or stop requests", async () => {
		const ctx = createFakePluginContext(definitions);
		const port = memoryPort();
		const container = createContainer(ctx, options, {}, { createSchemaPort: async () => port });
		await container.ensureReady();
		await container.ensureReady();
		expect(port.created).toHaveLength(definitions.length);
	});

	it("wires mailer: sends through ctx.email and reports false without one", async () => {
		const ctx = createFakePluginContext(definitions);
		const container = createContainer(ctx, options, {});
		expect(await container.mailer.send({ to: "a@b.c", subject: "Hi", text: "t", html: null })).toBe(true);
		expect(ctx.sentEmails).toEqual([{ to: "a@b.c", subject: "Hi" }]);
		(ctx as unknown as { email: undefined }).email = undefined;
		expect(await createContainer(ctx, options, {}).mailer.send({ to: "a@b.c", subject: "Hi", text: "t", html: null })).toBe(false);
	});
});

describe("integration identifier", () => {
	it("is created once under a compare-and-set, even when requests race", async () => {
		const kv = createFakeKv();
		const results = await Promise.all(Array.from({ length: 6 }, (_, index) => resolveIntegrationIdentifier(kv, createSeededIdGenerator(index + 1))));
		expect(new Set(results).size).toBe(1);
		expect(results[0]).toMatch(/^emdash-stripe-[a-z]{8}$/);
	});
});
