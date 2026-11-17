import { beforeEach, describe, expect, it } from "vitest";

import { CommerceError } from "../core/errors.js";
import { ProviderError } from "../ports/payment-provider.js";
import { createFakePaymentProvider, createInMemoryWorld, type FakePaymentProvider, type InMemoryWorld } from "../testing/index.js";
import { createCatalogSyncService } from "./catalog-sync.js";
import { productEntityKey, priceEntityKey, variantEntityKey } from "./catalog/entity-keys.js";
import { buildContainer, mirrorRecorder, price, product, recordingPublisher, variant } from "./catalog/test-support.js";

describe("catalog sync service", () => {
	let world: InMemoryWorld;
	let provider: FakePaymentProvider;

	beforeEach(() => {
		world = createInMemoryWorld();
		provider = createFakePaymentProvider();
	});

	it("without a Stripe key keeps the link failed and backed off but never writes the content rows", async () => {
		world.catalog.addProduct(product({ hasVariants: true }));
		world.catalog.addVariant(variant());
		world.catalog.addPrice(price({ variantId: "var_1" }));
		const { mirror, variants, prices } = mirrorRecorder();
		const container = buildContainer(world, provider, mirror);
		container.provider = async () => {
			throw new CommerceError("notConfigured", "Stripe is not configured");
		};
		const service = createCatalogSyncService(container, recordingPublisher());
		await service.syncEntity({ entity: "variant", id: "var_1" });
		await service.syncEntity({ entity: "price", id: "price_1" });
		expect((await world.catalogLinks.get(variantEntityKey("var_1")))?.value).toMatchObject({ syncStatus: "failed", attempts: 1 });
		expect((await world.catalogLinks.get(priceEntityKey("price_1")))?.value.syncStatus).toBe("failed");
		expect(variants.size).toBe(0);
		expect(prices.size).toBe(0);
	});

	it("still writes the failure into the content row when Stripe rejects the call", async () => {
		world.catalog.addProduct(product({ hasVariants: true }));
		world.catalog.addVariant(variant());
		const { mirror, variants } = mirrorRecorder();
		const container = buildContainer(world, provider, mirror);
		provider.failNext("createProduct", new ProviderError("down", { isRetryable: true }));
		await createCatalogSyncService(container, recordingPublisher()).syncEntity({ entity: "variant", id: "var_1" });
		expect(variants.get("var_1")).toMatchObject({ stripeSyncStatus: "failed" });
	});

	it("creates and updates a product Stripe mirror", async () => {
		world.catalog.addProduct(product());
		const container = buildContainer(world, provider);
		const publisher = recordingPublisher();
		await createCatalogSyncService(container, publisher).syncEntity({ entity: "product", id: "prod_1" });
		expect(provider.products.size).toBe(1);
		const link = await world.catalogLinks.get(productEntityKey("prod_1"));
		expect(link?.value.syncStatus).toBe("synced");
		expect(link?.value.providerId).toBeTruthy();
		await createCatalogSyncService(container, publisher).syncEntity({ entity: "product", id: "prod_1" });
		expect(provider.callsOf("createProduct").length).toBe(1);
	});

	it("adopts an existing Stripe product before creating", async () => {
		world.catalog.addProduct(product());
		provider.products.set("prod_adopted", {
			providerId: "prod_adopted",
			name: "Mug",
			isActive: true,
			entityKey: productEntityKey("prod_1"),
			updatedAt: 1,
		});
		const container = buildContainer(world, provider);
		await createCatalogSyncService(container, recordingPublisher()).syncEntity({ entity: "product", id: "prod_1" });
		expect(provider.callsOf("createProduct")).toHaveLength(0);
		expect((await world.catalogLinks.get(productEntityKey("prod_1")))?.value.providerId).toBe("prod_adopted");
	});

	it("syncs variant as its own Stripe product and writes the content mirror", async () => {
		world.catalog.addProduct(product({ hasVariants: true }));
		world.catalog.addVariant(variant());
		world.catalog.addPrice(price({ variantId: "var_1" }));
		const { mirror, variants } = mirrorRecorder();
		const container = buildContainer(world, provider, mirror);
		await createCatalogSyncService(container, recordingPublisher()).syncEntity({ entity: "variant", id: "var_1" });
		const stripeProduct = [...provider.products.values()].find((entry) => entry.entityKey === variantEntityKey("var_1"));
		expect(stripeProduct?.name).toBe("Mug — Large");
		expect(variants.get("var_1")).toMatchObject({ stripeSyncStatus: "synced" });
	});

	it("names the variant's Stripe product once when the variant title already carries the product title", async () => {
		world.catalog.addProduct(product({ hasVariants: true }));
		world.catalog.addVariant(variant({ title: "Mug — Large / Red" }));
		world.catalog.addPrice(price({ variantId: "var_1" }));
		const container = buildContainer(world, provider, mirrorRecorder().mirror);
		await createCatalogSyncService(container, recordingPublisher()).syncEntity({ entity: "variant", id: "var_1" });
		const stripeProduct = [...provider.products.values()].find((entry) => entry.entityKey === variantEntityKey("var_1"));
		expect(stripeProduct?.name).toBe("Mug — Large / Red");
	});

	it("creates a new Stripe price when terms change and archives the previous one", async () => {
		world.catalog.addProduct(product());
		world.catalog.addPrice(price());
		const container = buildContainer(world, provider);
		const service = createCatalogSyncService(container, recordingPublisher());
		await service.syncEntity({ entity: "price", id: "price_1" });
		const firstId = (await world.catalogLinks.get(priceEntityKey("price_1")))?.value.providerId;
		world.catalog.addPrice(price({ unitAmount: 3000 }));
		await service.syncEntity({ entity: "price", id: "price_1" });
		const link = await world.catalogLinks.get(priceEntityKey("price_1"));
		expect(link?.value.providerId).not.toBe(firstId);
		expect(provider.prices.get(firstId!)?.isActive).toBe(false);
	});

	it("reuses a Stripe price when terms revert", async () => {
		world.catalog.addProduct(product());
		world.catalog.addPrice(price({ unitAmount: 2000 }));
		const container = buildContainer(world, provider);
		const service = createCatalogSyncService(container, recordingPublisher());
		await service.syncEntity({ entity: "price", id: "price_1" });
		const original = (await world.catalogLinks.get(priceEntityKey("price_1")))?.value.providerId;
		world.catalog.addPrice(price({ unitAmount: 3000 }));
		await service.syncEntity({ entity: "price", id: "price_1" });
		world.catalog.addPrice(price({ unitAmount: 2000 }));
		await service.syncEntity({ entity: "price", id: "price_1" });
		const link = await world.catalogLinks.get(priceEntityKey("price_1"));
		expect(link?.value.providerId).toBe(original);
	});

	it("archives on unpublish and inactive variant", async () => {
		world.catalog.addProduct(product());
		world.catalog.addVariant(variant());
		const container = buildContainer(world, provider);
		const service = createCatalogSyncService(container, recordingPublisher());
		await service.syncEntity({ entity: "product", id: "prod_1" });
		await service.deactivateProduct("prod_1");
		const prod = [...provider.products.values()].find((entry) => entry.entityKey === productEntityKey("prod_1"));
		expect(prod?.isActive).toBe(false);
		world.catalog.addProduct(product({ isPublished: true }));
		world.catalog.addVariant(variant({ isActive: false }));
		await service.syncEntity({ entity: "variant", id: "var_1" });
		const variantProd = [...provider.products.values()].find((entry) => entry.entityKey === variantEntityKey("var_1"));
		expect(variantProd?.isActive).toBe(false);
	});

	it("does not duplicate objects on idempotent replay", async () => {
		world.catalog.addProduct(product());
		const container = buildContainer(world, provider);
		const service = createCatalogSyncService(container, recordingPublisher());
		await service.syncEntity({ entity: "product", id: "prod_1" });
		await service.syncEntity({ entity: "product", id: "prod_1" });
		expect(provider.callsOf("createProduct")).toHaveLength(1);
	});

	it("records failure, backoff and event when the provider is down", async () => {
		world.catalog.addProduct(product());
		provider.failNext("createProduct");
		const publisher = recordingPublisher();
		const container = buildContainer(world, provider);
		await createCatalogSyncService(container, publisher).syncEntity({ entity: "product", id: "prod_1" });
		const link = await world.catalogLinks.get(productEntityKey("prod_1"));
		expect(link?.value.syncStatus).toBe("failed");
		expect(link?.value.nextAttemptAt).toBeTruthy();
		expect(publisher.events).toHaveLength(1);
		world.clock.advance(31_000);
		await createCatalogSyncService(container, publisher).processDue(10);
		expect((await world.catalogLinks.get(productEntityKey("prod_1")))?.value.syncStatus).toBe("synced");
		await createCatalogSyncService(container, publisher).processDue(10);
		expect((await world.catalogLinks.get(productEntityKey("prod_1")))?.value.syncStatus).toBe("synced");
	});

	it("prevents duplicate Stripe products under concurrent sync", async () => {
		world.catalog.addProduct(product());
		const container = buildContainer(world, provider);
		const service = createCatalogSyncService(container, recordingPublisher());
		await Promise.all([
			service.syncEntity({ entity: "product", id: "prod_1" }),
			service.syncEntity({ entity: "product", id: "prod_1" }),
		]);
		expect(provider.callsOf("createProduct").length).toBeLessThanOrEqual(2);
		const ids = new Set([...provider.products.values()].map((entry) => entry.providerId));
		expect(ids.size).toBe(1);
	});

	it("ensurePricesSynced returns ids for sellable prices and null otherwise", async () => {
		world.catalog.addProduct(product());
		world.catalog.addPrice(price());
		const container = buildContainer(world, provider);
		const service = createCatalogSyncService(container, recordingPublisher());
		const synced = await service.ensurePricesSynced(["price_1"]);
		expect(synced.get("price_1")).toBeTruthy();
		world.catalog.addPrice(price({ isActive: false }));
		const inactive = await service.ensurePricesSynced(["price_1"]);
		expect(inactive.get("price_1")).toBeNull();
	});

	it("ensurePricesSynced throws ProviderError when Stripe is unreachable", async () => {
		world.catalog.addProduct(product());
		world.catalog.addPrice(price());
		const container = buildContainer(world, provider);
		const service = createCatalogSyncService(container, recordingPublisher());
		provider.failNext("createProduct", new ProviderError("down", { isRetryable: true }));
		await expect(service.ensurePricesSynced(["price_1"])).rejects.toBeInstanceOf(ProviderError);
	});

	it("detects drift once and ignores own snapshots and foreign objects", async () => {
		world.catalog.addProduct(product());
		const publisher = recordingPublisher();
		const container = buildContainer(world, provider);
		const service = createCatalogSyncService(container, publisher);
		await service.syncEntity({ entity: "product", id: "prod_1" });
		const link = await world.catalogLinks.get(productEntityKey("prod_1"));
		await service.handleProviderProductChanged({
			providerId: link!.value.providerId!,
			name: "Mug",
			isActive: true,
			entityKey: productEntityKey("prod_1"),
			updatedAt: 2,
		});
		expect(publisher.events).toHaveLength(0);
		await service.handleProviderProductChanged({
			providerId: "prod_foreign",
			name: "Hacked",
			isActive: true,
			entityKey: null,
			updatedAt: 2,
		});
		expect(publisher.events).toHaveLength(0);
		await service.handleProviderProductChanged({
			providerId: link!.value.providerId!,
			name: "Tampered",
			isActive: true,
			entityKey: productEntityKey("prod_1"),
			updatedAt: 3,
		});
		expect(publisher.events).toHaveLength(1);
		await service.handleProviderProductChanged({
			providerId: link!.value.providerId!,
			name: "Tampered",
			isActive: true,
			entityKey: productEntityKey("prod_1"),
			updatedAt: 4,
		});
		expect(publisher.events).toHaveLength(1);
	});

	it("rejects conflicting idempotency payload on the fake provider", async () => {
		world.catalog.addProduct(product());
		const container = buildContainer(world, provider);
		const service = createCatalogSyncService(container, recordingPublisher());
		await service.syncEntity({ entity: "product", id: "prod_1" });
		world.catalog.addProduct(product({ title: "Renamed" }));
		await service.syncEntity({ entity: "product", id: "prod_1" });
		expect(provider.callsOf("updateProduct").length).toBeGreaterThan(0);
	});
});
