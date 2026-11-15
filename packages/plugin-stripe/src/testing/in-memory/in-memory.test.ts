import { describe, expect, it } from "vitest";

import { inventoryContract } from "../contracts/inventory.contract.js";
import { recordIndexContract } from "../contracts/records.contract.js";
import {
	cartStoreContract,
	catalogLinkStoreContract,
	eventOutboxContract,
	rateLimiterContract,
	refundStoreContract,
	snapshotStoreContract,
	webhookInboxContract,
} from "../contracts/stores.contract.js";
import { createFixedClock } from "../clock.js";
import {
	createInMemoryCartStore,
	createInMemoryCatalogLinkStore,
	createInMemoryCheckoutSnapshotStore,
	createInMemoryEventOutbox,
	createInMemoryInventoryStore,
	createInMemoryRateLimiter,
	createInMemoryRecordIndex,
	createInMemoryRefundStore,
	createInMemoryWebhookInbox,
	createInMemoryWorld,
	createSeededIdGenerator,
} from "../index.js";

inventoryContract("in memory", () => {
	const clock = createFixedClock();
	return { store: createInMemoryInventoryStore(clock), clock };
});
recordIndexContract("in memory", () => {
	const clock = createFixedClock();
	return { index: createInMemoryRecordIndex(clock), clock };
});
cartStoreContract("in memory", () => ({ store: createInMemoryCartStore() }));
catalogLinkStoreContract("in memory", () => ({ store: createInMemoryCatalogLinkStore(), clock: createFixedClock() }));
snapshotStoreContract("in memory", () => ({ store: createInMemoryCheckoutSnapshotStore() }));
refundStoreContract("in memory", () => ({ store: createInMemoryRefundStore() }));
webhookInboxContract("in memory", () => {
	const clock = createFixedClock();
	return { inbox: createInMemoryWebhookInbox(clock), clock };
});
eventOutboxContract("in memory", () => {
	const clock = createFixedClock();
	return { outbox: createInMemoryEventOutbox(clock), clock };
});
rateLimiterContract("in memory", () => {
	const clock = createFixedClock();
	return { limiter: createInMemoryRateLimiter(clock), clock };
});

describe("in-memory world", () => {
	it("wires every port to one shared clock and deterministic ids", async () => {
		const first = createInMemoryWorld({ seed: 7 });
		const second = createInMemoryWorld({ seed: 7 });
		expect(first.ids.randomId()).toBe(second.ids.randomId());
		expect(createSeededIdGenerator(1).randomId()).not.toBe(createSeededIdGenerator(2).randomId());
		const order = await first.orders.create({ orderNumber: "ORD-1" } as never);
		expect((await first.orders.get(order.id))?.orderNumber).toBe("ORD-1");
		first.clock.advance(1000);
		expect(first.clock.now().toISOString()).toBe("2026-01-15T12:00:01.000Z");
	});

	it("repositories return copies, so callers cannot mutate stored state", async () => {
		const { customers } = createInMemoryWorld();
		const created = await customers.create({ email: "a@b.c" } as never);
		created.email = "changed@b.c";
		expect((await customers.get(created.id))?.email).toBe("a@b.c");
		await expect(customers.update("missing", {})).rejects.toThrow(/not found/);
	});
});
