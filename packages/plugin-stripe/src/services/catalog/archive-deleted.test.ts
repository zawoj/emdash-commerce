import { beforeEach, describe, expect, it } from "vitest";

import { createFakePaymentProvider, createInMemoryWorld, type FakePaymentProvider, type InMemoryWorld } from "../../testing/index.js";
import { createCatalogSyncService } from "../catalog-sync.js";
import { priceEntityKey, productEntityKey, variantEntityKey } from "./entity-keys.js";
import { buildContainer, price, product, recordingPublisher, stripeProductOf, variant } from "./test-support.js";

describe("catalog sync: entries deleted in EmDash are archived in Stripe from their link", () => {
	let world: InMemoryWorld;
	let provider: FakePaymentProvider;
	beforeEach(() => {
		world = createInMemoryWorld();
		provider = createFakePaymentProvider();
	});

	const synced = async () => {
		world.catalog.addProduct(product({ hasVariants: true }));
		world.catalog.addVariant(variant());
		world.catalog.addPrice(price({ variantId: "var_1" }));
		const service = createCatalogSyncService(buildContainer(world, provider), recordingPublisher());
		await service.syncEntity({ entity: "product", id: "prod_1" });
		const priceId = (await world.catalogLinks.get(priceEntityKey("price_1")))!.value.providerId!;
		return { service, priceId };
	};

	it("archives a deleted price", async () => {
		const { service, priceId } = await synced();
		world.catalog.remove("price", "price_1");
		await service.archiveDeleted({ entity: "price", id: "price_1" });
		expect(provider.prices.get(priceId)?.isActive).toBe(false);
	});

	it("archives a deleted variant's Stripe product without clearing anything else", async () => {
		const { service } = await synced();
		const before = stripeProductOf(provider, variantEntityKey("var_1"))!;
		world.catalog.remove("variant", "var_1");
		await service.archiveDeleted({ entity: "variant", id: "var_1" });
		const after = stripeProductOf(provider, variantEntityKey("var_1"))!;
		expect(after.isActive).toBe(false);
		expect(after.name).toBe(before.name);
	});

	it("archives a deleted product and the variants and prices that still reference it", async () => {
		const { service, priceId } = await synced();
		world.catalog.remove("product", "prod_1");
		await service.archiveDeleted({ entity: "product", id: "prod_1" });
		expect(stripeProductOf(provider, productEntityKey("prod_1"))?.isActive).toBe(false);
		expect(stripeProductOf(provider, variantEntityKey("var_1"))?.isActive).toBe(false);
		expect(provider.prices.get(priceId)?.isActive).toBe(false);
	});

	it("is a no-op the second time, and archives again after a recreate within Stripe's key window", async () => {
		const { service } = await synced();
		world.catalog.remove("variant", "var_1");
		await service.archiveDeleted({ entity: "variant", id: "var_1" });
		const writes = provider.callsOf("updateProduct").length;
		await service.archiveDeleted({ entity: "variant", id: "var_1" });
		expect(provider.callsOf("updateProduct")).toHaveLength(writes);

		world.catalog.addVariant(variant());
		await service.syncEntity({ entity: "variant", id: "var_1" });
		expect(stripeProductOf(provider, variantEntityKey("var_1"))?.isActive).toBe(true);
		world.catalog.remove("variant", "var_1");
		await service.archiveDeleted({ entity: "variant", id: "var_1" });
		expect(stripeProductOf(provider, variantEntityKey("var_1"))?.isActive).toBe(false);
	});

	it("does nothing for an entity that was never synced", async () => {
		const service = createCatalogSyncService(buildContainer(world, provider), recordingPublisher());
		await service.archiveDeleted({ entity: "price", id: "price_x" });
		expect(provider.calls).toHaveLength(0);
		// ... and no link is made up for it: a ghost `pending` link would stay due for cron forever.
		expect(await world.catalogLinks.get(priceEntityKey("price_x"))).toBeNull();
	});

	it("settles a link that never reached Stripe instead of leaving it pending", async () => {
		const container = buildContainer(world, provider);
		const service = createCatalogSyncService(container, recordingPublisher());
		await world.catalogLinks.put({ entityKey: variantEntityKey("var_9"), providerId: null, providerPriceByFingerprint: {}, fingerprint: null, syncStatus: "pending", lastError: null, attempts: 0, nextAttemptAt: null, syncedAt: null, driftFields: [], syncVersion: 3, lastWrittenHash: null, lastWritten: null }, null);
		await service.archiveDeleted({ entity: "variant", id: "var_9" });
		expect((await world.catalogLinks.get(variantEntityKey("var_9")))!.value.syncStatus).toBe("synced");
		expect(await world.catalogLinks.listDue("2999-01-01T00:00:00.000Z", 10)).toEqual([]);
		expect(provider.calls).toHaveLength(0);
	});

	it("cron settles a pending link whose entity is gone: archives what Stripe holds, and stops being due", async () => {
		const { service } = await synced();
		world.catalog.remove("variant", "var_1");
		world.catalog.remove("price", "price_1");
		for (const key of [variantEntityKey("var_1"), priceEntityKey("price_1")]) {
			await world.catalogLinks.put({ ...(await world.catalogLinks.get(key))!.value, syncStatus: "pending" }, (await world.catalogLinks.get(key))!.revision);
		}
		expect(await world.catalogLinks.listDue("2999-01-01T00:00:00.000Z", 10)).toHaveLength(2);
		await service.processDue(10);
		expect(stripeProductOf(provider, variantEntityKey("var_1"))?.isActive).toBe(false);
		expect([...provider.prices.values()].every((entry) => entry.isActive === false)).toBe(true);
		expect(await world.catalogLinks.listDue("2999-01-01T00:00:00.000Z", 10)).toEqual([]);
	});
});
