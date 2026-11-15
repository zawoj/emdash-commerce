import { beforeEach, describe, expect, it } from "vitest";

import { buildCollectionDefinitions } from "../adapters/emdash/schema/collections.js";
import { PRODUCT_FIELD, VARIANT_FIELD } from "../adapters/emdash/schema/field-names.js";
import { resetEnsureSchemaMemo, type SchemaPort } from "../adapters/emdash/schema/reconcile.js";
import { commerceOptionsSchema } from "../contracts/options.js";
import type { CommerceExtensions } from "../contracts/extensions.js";
import type { SellableRef } from "../core/catalog.js";
import type { Order } from "../core/order.js";
import { commitOrderStock } from "../services/payments/settlement-steps.js";
import { createEventPublisher } from "../services/outbox.js";
import { createFakePaymentProvider, createFakePluginContext, type FakePaymentProvider, type FakePluginContext } from "../testing/index.js";
import { createContainer, resetContainerMemo, type ContainerDeps } from "./container.js";
import { buildHooks } from "./hooks.js";
import { createInertSchemaPort } from "../testing/fakes/schema-port.js";

const options = commerceOptionsSchema.parse({});
const slugs = options.collections;
const definitions = buildCollectionDefinitions(slugs, options.supportedCurrencies);
const VARIANT: SellableRef = { kind: "variant", id: "" };

const schemaPort = (): SchemaPort => createInertSchemaPort();

describe("plugin container: catalog mirror and event publisher are wired, not bound per hook", () => {
	let ctx: FakePluginContext;
	let provider: FakePaymentProvider;
	let variantId: string;
	let productId: string;
	let deps: ContainerDeps;
	const extensions = (seen: string[]): CommerceExtensions => ({
		subscribers: [{ id: "audit", events: ["catalog.sync_failed"], handle: async (event) => void seen.push(event.type) }],
	});

	beforeEach(() => {
		resetEnsureSchemaMemo();
		resetContainerMemo();
		ctx = createFakePluginContext(definitions);
		provider = createFakePaymentProvider();
		deps = { createSchemaPort: async () => schemaPort(), createProvider: () => provider, relations: ctx.fakeRelations, env: { STRIPE_SECRET_KEY: "sk_test_x" } };
		productId = ctx.content.seedEntry(slugs.products, { [PRODUCT_FIELD.title]: "Shirt" }, { status: "published" });
		variantId = ctx.content.seedEntry(slugs.variants, { [VARIANT_FIELD.title]: "M", [VARIANT_FIELD.stock]: 0 });
		void ctx.fakeRelations.setParent(slugs.variants, variantId, VARIANT_FIELD.product, productId);
		VARIANT.id = variantId;
	});

	const stockField = (): unknown => ctx.content.entries(slugs.variants).find((entry) => entry.id === variantId)?.data[VARIANT_FIELD.stock];

	it("createContainer owns the mirror and it only knows variants and prices (never products)", () => {
		const container = createContainer(ctx, options, {}, deps);
		expect(Object.keys(container.catalogMirror).sort()).toEqual(["writePriceActive", "writePriceSync", "writeVariantStock", "writeVariantSync"]);
	});

	it("hands the container logger to the Stripe provider for adapter warnings", async () => {
		let given: unknown;
		const container = createContainer(ctx, options, {}, { ...deps, createProvider: (config) => ((given = config.log), provider) });
		await container.provider();
		expect(given).toBe(container.log);
	});

	it("a paid order for a tracked variant writes the variant's stock field and mirroredOnHand", async () => {
		const container = createContainer(ctx, options, {}, deps);
		await container.inventory.adjust(VARIANT, 10, "seed");
		await container.inventory.setMirroredOnHand(VARIANT, 10);
		const reserved = await container.inventory.reserve({
			reservationId: "res_1",
			cartId: "cart_1",
			lines: [{ sellable: VARIANT, quantity: 3, isGuarded: true }],
			expiresAt: new Date(Date.now() + 3600_000).toISOString(),
		});
		expect(reserved.ok).toBe(true);
		await commitOrderStock({ container, publisher: createEventPublisher(container) }, { id: "ord_1" } as Order, "res_1");
		expect(stockField()).toBe(7);
		expect(await container.inventory.get(VARIANT)).toMatchObject({ onHand: 7, mirroredOnHand: 7 });
		expect(ctx.logs.filter((entry) => entry.level === "warn" && /mirror/i.test(entry.message))).toEqual([]);
	});

	it("an editor stock edit after a sale adds only the editor's delta", async () => {
		const hooks = buildHooks(options, {}, deps);
		const afterSave = hooks["content:afterSave"]!;
		const run = typeof afterSave === "function" ? afterSave : afterSave.handler;
		const save = (stock: number) => run({ collection: slugs.variants, isNew: false, content: { id: variantId, type: slugs.variants, status: "draft", data: { [VARIANT_FIELD.stock]: stock } } }, ctx);
		await save(12);
		const container = createContainer(ctx, options, {}, deps);
		expect(await container.inventory.get(VARIANT)).toMatchObject({ onHand: 12, mirroredOnHand: 12 });
		await container.inventory.reserve({ reservationId: "res_2", cartId: "c", lines: [{ sellable: VARIANT, quantity: 2, isGuarded: true }], expiresAt: new Date(Date.now() + 3600_000).toISOString() });
		await commitOrderStock({ container, publisher: createEventPublisher(container) }, { id: "ord_2" } as Order, "res_2");
		expect(stockField()).toBe(10);
		await save(15);
		expect(await container.inventory.get(VARIANT)).toMatchObject({ onHand: 15, mirroredOnHand: 15 });
	});

	it("hook failures reach the real publisher: the site's subscriber is called and no outbox record names a catalog subscriber", async () => {
		const seen: string[] = [];
		const hooks = buildHooks(options, extensions(seen), deps);
		provider.failNext("createProduct");
		const afterSave = hooks["content:afterSave"]!;
		const run = typeof afterSave === "function" ? afterSave : afterSave.handler;
		await run({ collection: slugs.products, isNew: false, content: { id: productId, title: "Shirt" } }, ctx);
		expect(seen).toEqual(["catalog.sync_failed"]);
		const container = createContainer(ctx, options, extensions(seen), deps);
		const all = [...(await container.outbox.listDue("9999-01-01T00:00:00.000Z", 100)), ...(await container.outbox.listDead(100))];
		const stored = await ctx.fakeStorage.event_outbox?.query({ limit: 100 });
		const subscriberIds = new Set([...all, ...(stored?.items.map((item) => item.data as { deliveries: Record<string, unknown> }) ?? [])].flatMap((record) => Object.keys(record.deliveries)));
		expect(subscriberIds.has("catalog")).toBe(false);
		expect(subscriberIds.has("audit")).toBe(true);
	});
});
