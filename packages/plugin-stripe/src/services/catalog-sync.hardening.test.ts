import { beforeEach, describe, expect, it } from "vitest";

import { createFakePaymentProvider, createInMemoryWorld, type FakePaymentProvider, type InMemoryWorld } from "../testing/index.js";
import { createCatalogSyncService } from "./catalog-sync.js";
import { priceEntityKey, productEntityKey, variantEntityKey } from "./catalog/entity-keys.js";
import { buildContainer, price, product, recordingPublisher, stripeProductOf, variant } from "./catalog/test-support.js";

const WRITE_METHODS = ["createProduct", "updateProduct", "createPrice", "updatePrice"] as const;

const writesOf = (provider: FakePaymentProvider): number => WRITE_METHODS.reduce((sum, method) => sum + provider.callsOf(method).length, 0);

describe("catalog sync: idempotency keys never repeat across distinct intents", () => {
	let world: InMemoryWorld;
	let provider: FakePaymentProvider;
	beforeEach(() => {
		world = createInMemoryWorld();
		provider = createFakePaymentProvider();
	});

	it("follows every product active toggle even though Stripe caches keys (archive, reactivate, archive)", async () => {
		const service = createCatalogSyncService(buildContainer(world, provider), recordingPublisher());
		world.catalog.addProduct(product());
		await service.syncEntity({ entity: "product", id: "prod_1" });
		const isActiveInStripe = () => stripeProductOf(provider, productEntityKey("prod_1"))?.isActive;
		expect(isActiveInStripe()).toBe(true);
		for (const expected of [false, true, false, true]) {
			world.catalog.addProduct(product({ isPublished: expected }));
			if (expected) await service.syncEntity({ entity: "product", id: "prod_1" });
			else await service.deactivateProduct("prod_1");
			expect(isActiveInStripe()).toBe(expected);
		}
	});

	it("follows every variant toggle", async () => {
		const service = createCatalogSyncService(buildContainer(world, provider), recordingPublisher());
		world.catalog.addProduct(product({ hasVariants: true }));
		world.catalog.addVariant(variant());
		for (const isActive of [true, false, true, false]) {
			world.catalog.addVariant(variant({ isActive }));
			await service.syncEntity({ entity: "variant", id: "var_1" });
			expect(stripeProductOf(provider, variantEntityKey("var_1"))?.isActive).toBe(isActive);
		}
	});

	it("follows every price active toggle", async () => {
		const service = createCatalogSyncService(buildContainer(world, provider), recordingPublisher());
		world.catalog.addProduct(product());
		world.catalog.addPrice(price());
		await service.syncEntity({ entity: "price", id: "price_1" });
		const stripePriceId = (await world.catalogLinks.get(priceEntityKey("price_1")))!.value.providerId!;
		for (const isActive of [false, true, false, true]) {
			world.catalog.addPrice(price({ isActive }));
			await service.syncEntity({ entity: "price", id: "price_1" });
			expect(provider.prices.get(stripePriceId)?.isActive).toBe(isActive);
		}
	});

	it("follows a price revert A -> B -> A -> B (archive keys of the old price repeat otherwise)", async () => {
		const service = createCatalogSyncService(buildContainer(world, provider), recordingPublisher());
		world.catalog.addProduct(product());
		for (const unitAmount of [2000, 3000, 2000, 3000]) {
			world.catalog.addPrice(price({ unitAmount }));
			await service.syncEntity({ entity: "price", id: "price_1" });
			const activeAmounts = [...provider.prices.values()].filter((entry) => entry.isActive).map((entry) => entry.unitAmount);
			expect(activeAmounts).toEqual([unitAmount]);
		}
		expect(provider.prices.size).toBe(2);
		// A revert finds the old price through the link, not through Stripe's 24 h key cache.
		expect(provider.callsOf("createPrice")).toHaveLength(2);
		expect(Object.keys((await world.catalogLinks.get(priceEntityKey("price_1")))!.value.providerPriceByFingerprint)).toHaveLength(2);
	});

	it("a reactivation done by checkout and a later archive do not reuse the key of the first archive", async () => {
		const service = createCatalogSyncService(buildContainer(world, provider), recordingPublisher());
		world.catalog.addProduct(product({ hasVariants: true }));
		world.catalog.addVariant(variant());
		world.catalog.addPrice(price({ variantId: "var_1" }));
		const stripePriceId = (await service.ensurePricesSynced(["price_1"])).get("price_1")!;
		world.catalog.addVariant(variant({ isActive: false }));
		await service.syncEntity({ entity: "variant", id: "var_1" });
		expect(provider.prices.get(stripePriceId)?.isActive).toBe(false);
		world.catalog.addVariant(variant({ isActive: true }));
		await service.ensurePricesSynced(["price_1"]);
		expect(provider.prices.get(stripePriceId)?.isActive).toBe(true);
		await service.deactivateProduct("prod_1");
		expect(provider.prices.get(stripePriceId)?.isActive).toBe(false);
	});

	it("reuses the key of a retried attempt (same version, same payload) so a retry stays idempotent", async () => {
		const service = createCatalogSyncService(buildContainer(world, provider), recordingPublisher());
		world.catalog.addProduct(product());
		await service.syncEntity({ entity: "product", id: "prod_1" });
		world.catalog.addProduct(product({ title: "First rename" }));
		await service.syncEntity({ entity: "product", id: "prod_1" });
		world.catalog.addProduct(product({ title: "Renamed" }));
		provider.failNext("updateProduct");
		await service.syncEntity({ entity: "product", id: "prod_1" });
		world.clock.advance(31_000);
		await service.processDue(10);
		const updates = provider.callsOf("updateProduct");
		expect(updates).toHaveLength(3);
		expect(updates[2]!.idempotencyKey).toBe(updates[1]!.idempotencyKey);
		expect(updates[1]!.idempotencyKey).not.toBe(updates[0]!.idempotencyKey);
		expect(stripeProductOf(provider, productEntityKey("prod_1"))?.name).toBe("Renamed");
	});

	it("bumps the sync version once per change and concurrent changes never lose a bump", async () => {
		const service = createCatalogSyncService(buildContainer(world, provider), recordingPublisher());
		world.catalog.addProduct(product());
		await Promise.all([service.syncEntity({ entity: "product", id: "prod_1" }), service.syncEntity({ entity: "product", id: "prod_1" })]);
		expect((await world.catalogLinks.get(productEntityKey("prod_1")))!.value.syncVersion).toBe(2);
	});
});

describe("catalog sync: archive decisions and races", () => {
	let world: InMemoryWorld;
	let provider: FakePaymentProvider;
	beforeEach(() => {
		world = createInMemoryWorld();
		provider = createFakePaymentProvider();
	});

	it("never creates a Stripe object for an inactive variant that was never synced", async () => {
		world.catalog.addProduct(product({ hasVariants: true }));
		world.catalog.addVariant(variant({ isActive: false }));
		await createCatalogSyncService(buildContainer(world, provider), recordingPublisher()).syncEntity({ entity: "variant", id: "var_1" });
		expect(stripeProductOf(provider, variantEntityKey("var_1"))).toBeUndefined();
	});

	it("creates one Stripe product when two syncs race and Stripe's search has not caught up with the first create", async () => {
		world.catalog.addProduct(product());
		provider.catalog.findProductByEntity = async () => null;
		const service = createCatalogSyncService(buildContainer(world, provider), recordingPublisher());
		await Promise.all([service.syncEntity({ entity: "product", id: "prod_1" }), service.syncEntity({ entity: "product", id: "prod_1" })]);
		expect(provider.products.size).toBe(1);
	});

	it("keeps the old terms reusable even when the stored link predates the fingerprint map", async () => {
		world.catalog.addProduct(product());
		const service = createCatalogSyncService(buildContainer(world, provider), recordingPublisher());
		world.catalog.addPrice(price({ unitAmount: 2000 }));
		await service.syncEntity({ entity: "price", id: "price_1" });
		const stored = (await world.catalogLinks.get(priceEntityKey("price_1")))!;
		await world.catalogLinks.put({ ...stored.value, providerPriceByFingerprint: {} }, stored.revision);
		world.catalog.addPrice(price({ unitAmount: 3000 }));
		await service.syncEntity({ entity: "price", id: "price_1" });
		expect(Object.keys((await world.catalogLinks.get(priceEntityKey("price_1")))!.value.providerPriceByFingerprint)).toHaveLength(2);
	});
});

describe("catalog sync: no Stripe calls when nothing changed", () => {
	let world: InMemoryWorld;
	let provider: FakePaymentProvider;
	beforeEach(() => {
		world = createInMemoryWorld();
		provider = createFakePaymentProvider();
		world.catalog.addProduct(product());
		world.catalog.addPrice(price());
	});

	it("ensurePricesSynced makes zero provider writes on the second call and only the needed writes after an edit", async () => {
		const service = createCatalogSyncService(buildContainer(world, provider), recordingPublisher());
		const first = await service.ensurePricesSynced(["price_1"]);
		expect(first.get("price_1")).toBeTruthy();
		const afterFirst = writesOf(provider);
		expect(afterFirst).toBeGreaterThan(0);
		const second = await service.ensurePricesSynced(["price_1"]);
		expect(second.get("price_1")).toBe(first.get("price_1"));
		expect(writesOf(provider)).toBe(afterFirst);

		// An editor changes the title and the hook marks everything pending: one product update, no price write.
		world.catalog.addProduct(product({ title: "Mug v2" }));
		await service.syncEntity({ entity: "product", id: "prod_1" });
		expect(provider.callsOf("updateProduct")).toHaveLength(1);
		expect(provider.callsOf("updatePrice")).toHaveLength(0);
		const settled = writesOf(provider);
		await service.ensurePricesSynced(["price_1"]);
		expect(writesOf(provider)).toBe(settled);
	});

	it("serves a synced price from its link without even asking for the provider", async () => {
		const container = buildContainer(world, provider);
		const service = createCatalogSyncService(container, recordingPublisher());
		const first = await service.ensurePricesSynced(["price_1"]);
		container.provider = async () => {
			throw new Error("the provider must not be needed on the fast path");
		};
		expect((await service.ensurePricesSynced(["price_1"])).get("price_1")).toBe(first.get("price_1"));
	});

	it("an edit that does not change what Stripe stores (a content-only field) writes nothing", async () => {
		const service = createCatalogSyncService(buildContainer(world, provider), recordingPublisher());
		await service.syncEntity({ entity: "product", id: "prod_1" });
		const before = writesOf(provider);
		await service.syncEntity({ entity: "product", id: "prod_1" });
		expect(writesOf(provider)).toBe(before);
		const link = await world.catalogLinks.get(productEntityKey("prod_1"));
		expect(link!.value.syncStatus).toBe("synced");
	});

	it("reactivating a variant re-syncs its prices on the next checkout even though the price link says synced", async () => {
		world.catalog.addProduct(product({ hasVariants: true }));
		world.catalog.addVariant(variant());
		world.catalog.addPrice(price({ variantId: "var_1" }));
		const service = createCatalogSyncService(buildContainer(world, provider), recordingPublisher());
		const synced = (await service.ensurePricesSynced(["price_1"])).get("price_1")!;
		world.catalog.addVariant(variant({ isActive: false }));
		expect((await service.ensurePricesSynced(["price_1"])).get("price_1")).toBeNull();
		await service.syncEntity({ entity: "variant", id: "var_1" });
		expect(provider.prices.get(synced)?.isActive).toBe(false);
		world.catalog.addVariant(variant({ isActive: true }));
		await service.syncEntity({ entity: "variant", id: "var_1" });
		expect((await service.ensurePricesSynced(["price_1"])).get("price_1")).toBe(synced);
		expect(provider.prices.get(synced)?.isActive).toBe(true);
	});

	it("an admin resync rewrites Stripe even when the payload equals the last write", async () => {
		const service = createCatalogSyncService(buildContainer(world, provider), recordingPublisher());
		await service.syncEntity({ entity: "product", id: "prod_1" });
		const before = provider.callsOf("updateProduct").length;
		await service.resync("prod_1");
		await service.processDue(50);
		expect(provider.callsOf("updateProduct").length).toBeGreaterThan(before);
	});
});

describe("catalog sync: drift compares with what the plugin last wrote", () => {
	let world: InMemoryWorld;
	let provider: FakePaymentProvider;
	beforeEach(() => {
		world = createInMemoryWorld();
		provider = createFakePaymentProvider();
		world.catalog.addProduct(product());
	});

	it("ignores a snapshot equal to the last write, reports a different one once per distinct set", async () => {
		const publisher = recordingPublisher();
		const service = createCatalogSyncService(buildContainer(world, provider), publisher);
		await service.syncEntity({ entity: "product", id: "prod_1" });
		const providerId = (await world.catalogLinks.get(productEntityKey("prod_1")))!.value.providerId!;
		const snapshot = (name: string, isActive = true) => ({ providerId, name, isActive, entityKey: productEntityKey("prod_1"), updatedAt: 9 });
		await service.handleProviderProductChanged(snapshot("Mug"));
		expect(publisher.events).toHaveLength(0);
		await service.handleProviderProductChanged(snapshot("Tampered"));
		await service.handleProviderProductChanged(snapshot("Tampered"));
		expect(publisher.events.map((event) => event.type)).toEqual(["catalog.drift_detected"]);
		expect((await world.catalogLinks.get(productEntityKey("prod_1")))!.value.driftFields).toEqual(["name"]);
		await service.handleProviderProductChanged(snapshot("Tampered", false));
		expect(publisher.events).toHaveLength(2);
		expect(publisher.events[1]).toMatchObject({ data: { fields: ["active", "name"] } });
	});

	it("clears the recorded drift when the plugin rewrites Stripe, so the same drift is announced again later", async () => {
		const publisher = recordingPublisher();
		const service = createCatalogSyncService(buildContainer(world, provider), publisher);
		await service.syncEntity({ entity: "product", id: "prod_1" });
		const providerId = (await world.catalogLinks.get(productEntityKey("prod_1")))!.value.providerId!;
		const tampered = { providerId, name: "Tampered", isActive: true, entityKey: productEntityKey("prod_1"), updatedAt: 9 };
		await service.handleProviderProductChanged(tampered);
		await service.resync("prod_1");
		await service.processDue(50);
		expect((await world.catalogLinks.get(productEntityKey("prod_1")))!.value.driftFields).toEqual([]);
		await service.handleProviderProductChanged(tampered);
		expect(publisher.events.filter((event) => event.type === "catalog.drift_detected")).toHaveLength(2);
	});

	it("does not report content that was edited but not yet synced as drift", async () => {
		const publisher = recordingPublisher();
		const service = createCatalogSyncService(buildContainer(world, provider), publisher);
		await service.syncEntity({ entity: "product", id: "prod_1" });
		const providerId = (await world.catalogLinks.get(productEntityKey("prod_1")))!.value.providerId!;
		world.catalog.addProduct(product({ title: "Edited, sync pending" }));
		await service.handleProviderProductChanged({ providerId, name: "Mug", isActive: true, entityKey: productEntityKey("prod_1"), updatedAt: 9 });
		expect(publisher.events).toHaveLength(0);
	});

	it("detects price drift against the written terms and ignores an archived old price of the same entity", async () => {
		const publisher = recordingPublisher();
		const service = createCatalogSyncService(buildContainer(world, provider), publisher);
		world.catalog.addPrice(price({ unitAmount: 2000 }));
		await service.syncEntity({ entity: "price", id: "price_1" });
		const oldId = (await world.catalogLinks.get(priceEntityKey("price_1")))!.value.providerId!;
		world.catalog.addPrice(price({ unitAmount: 3000 }));
		await service.syncEntity({ entity: "price", id: "price_1" });
		const link = (await world.catalogLinks.get(priceEntityKey("price_1")))!.value;
		const snap = (providerId: string, unitAmount: number, isActive: boolean) => ({
			providerId,
			providerProductId: "x",
			unitAmount,
			currency: price().currency,
			isActive,
			entityKey: priceEntityKey("price_1"),
		});
		await service.handleProviderPriceChanged(snap(oldId, 2000, false));
		await service.handleProviderPriceChanged(snap(link.providerId!, 3000, true));
		expect(publisher.events).toHaveLength(0);
		await service.handleProviderPriceChanged(snap(link.providerId!, 3000, false));
		expect(publisher.events).toHaveLength(1);
		expect(publisher.events[0]).toMatchObject({ data: { entity: "price", fields: ["active"] } });
	});

	it("stamps events and sync state with the container clock", async () => {
		const publisher = recordingPublisher();
		const container = buildContainer(world, provider);
		world.clock.advance(5 * 24 * 3600_000);
		const service = createCatalogSyncService(container, publisher);
		await service.syncEntity({ entity: "product", id: "prod_1" });
		const link = (await world.catalogLinks.get(productEntityKey("prod_1")))!.value;
		expect(link.syncedAt).toBe(world.clock.now().toISOString());
		provider.failNext("updateProduct");
		world.catalog.addProduct(product({ title: "x" }));
		await service.syncEntity({ entity: "product", id: "prod_1" });
		expect(publisher.events[0]!.occurredAt).toBe(world.clock.now().toISOString());
	});
});
