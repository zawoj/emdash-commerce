import { describe, expect, it } from "vitest";

import { inventoryContract } from "../../../testing/contracts/inventory.contract.js";
import { recordIndexContract } from "../../../testing/contracts/records.contract.js";
import {
	cartStoreContract,
	catalogLinkStoreContract,
	eventOutboxContract,
	rateLimiterContract,
	refundStoreContract,
	snapshotStoreContract,
	webhookInboxContract,
} from "../../../testing/contracts/stores.contract.js";
import type { SellableRef } from "../../../core/catalog.js";
import { createFixedClock } from "../../../testing/clock.js";
import { createFakeKv, createFakeStorage, FakeStorageQueryError, type FakeStorageCollection } from "../../../testing/fakes/storage.js";
import { STORAGE, type StorageName } from "../constants.js";
import { createInventoryStore, type StockLevelDoc, type StoredReservation } from "./inventory-store.js";
import { createRecordIndex, type IndexEntry } from "./record-index.js";
import {
	createCartStore,
	createCatalogLinkStore,
	createCheckoutSnapshotStore,
	createRateLimiter,
	createRefundStore,
	type CatalogLinkDoc,
	type RateLimitDoc,
} from "./simple-stores.js";
import { storageDeclaration } from "./declaration.js";
import { createEventOutbox, type OutboxDoc } from "./event-outbox.js";
import { createWebhookInbox, type InboxDoc } from "./webhook-inbox.js";

/** A collection that enforces exactly the indexes the plugin declares, like EmDash does. */
export const declared = <T>(name: StorageName): FakeStorageCollection<T> =>
	createFakeStorage<T>({ indexes: [...storageDeclaration[name].indexes], uniqueIndexes: [] });

const inventoryParts = () => {
	const clock = createFixedClock();
	const levels = declared<StockLevelDoc>(STORAGE.inventory);
	const reservations = declared<StoredReservation>(STORAGE.reservations);
	return { clock, levels, reservations, store: createInventoryStore(levels, reservations, clock) };
};

inventoryContract("plugin storage", () => {
	const { store, clock } = inventoryParts();
	return { store, clock };
});
recordIndexContract("plugin storage", () => {
	const clock = createFixedClock();
	return { index: createRecordIndex(declared<IndexEntry>(STORAGE.recordIndex), clock), clock };
});
cartStoreContract("plugin storage", () => ({ store: createCartStore(declared(STORAGE.carts)) }));
catalogLinkStoreContract("plugin storage", () => ({
	store: createCatalogLinkStore(declared<CatalogLinkDoc>(STORAGE.catalogLinks)),
	clock: createFixedClock(),
}));
snapshotStoreContract("plugin storage", () => ({ store: createCheckoutSnapshotStore(declared(STORAGE.checkoutSnapshots)) }));
refundStoreContract("plugin storage", () => ({ store: createRefundStore(declared(STORAGE.refunds)) }));
webhookInboxContract("plugin storage", () => {
	const clock = createFixedClock();
	return { inbox: createWebhookInbox(declared<InboxDoc>(STORAGE.webhookInbox), createFakeKv(), clock), clock };
});
eventOutboxContract("plugin storage", () => {
	const clock = createFixedClock();
	return { outbox: createEventOutbox(declared<OutboxDoc>(STORAGE.eventOutbox), clock), clock };
});
rateLimiterContract("plugin storage", () => {
	const clock = createFixedClock();
	return { limiter: createRateLimiter(declared<RateLimitDoc>(STORAGE.rateLimits), clock), clock };
});

describe("inventory store on plugin storage: failure handling", () => {
	const A: SellableRef = { kind: "variant", id: "a" };
	const B: SellableRef = { kind: "product", id: "b" };
	const input = (id: string, lines: Array<[typeof A, number]>) => ({
		reservationId: id,
		cartId: "cart",
		lines: lines.map(([sellable, quantity]) => ({ sellable, quantity, isGuarded: true })),
		expiresAt: "2026-01-15T13:00:00.000Z",
	});

	it("retries a guarded update that aborted with a serialization failure", async () => {
		const { store, levels } = inventoryParts();
		await store.adjust(A, 5, "seed");
		levels.failNext("updateIf", 3);
		expect((await store.reserve(input("r1", [[A, 2]]))).ok).toBe(true);
		expect(await store.get(A)).toMatchObject({ available: 3, reserved: 2 });
	});

	it("gives up after the bounded retries and surfaces the error without moving stock", async () => {
		const { store, levels } = inventoryParts();
		await store.adjust(A, 5, "seed");
		levels.failNext("updateIf", 50);
		await expect(store.reserve(input("r1", [[A, 2]]))).rejects.toThrow(/retried/);
		levels.failNext("updateIf", 0);
		expect(await store.get(A)).toMatchObject({ available: 5, reserved: 0 });
	});

	it("keeps the reservation record accurate per taken line, so an expiry sweep releases exactly what was taken", async () => {
		const { store, reservations, levels } = inventoryParts();
		await store.adjust(A, 5, "seed");
		await store.adjust(B, 5, "seed");
		// The second line's update dies after the first line was taken: crash simulation.
		let updates = 0;
		const original = levels.updateIf.bind(levels);
		levels.updateIf = (async (id: string, args: Parameters<typeof original>[1]) => {
			updates += 1;
			if (updates === 2) throw new Error("process died");
			return original(id, args);
		}) as typeof levels.updateIf;
		await expect(store.reserve(input("r1", [[A, 2], [B, 2]]))).rejects.toThrow("process died");
		levels.updateIf = original as typeof levels.updateIf;
		const record = (await reservations.get("r1"))!;
		expect(record.lines.map((line) => line.isTaken)).toEqual([true, false]);
		await store.release("r1");
		expect(await store.get(A)).toMatchObject({ available: 5, reserved: 0 });
		expect(await store.get(B)).toMatchObject({ available: 5, reserved: 0 });
	});

	it("uses a gte guard no weaker than the delta: a reservation larger than stock never applies", async () => {
		const { store, levels } = inventoryParts();
		await store.adjust(A, 2, "seed");
		const calls: unknown[] = [];
		const original = levels.updateIf.bind(levels);
		levels.updateIf = (async (id: string, args: Parameters<typeof original>[1]) => {
			calls.push(args);
			return original(id, args);
		}) as typeof levels.updateIf;
		await store.reserve(input("r1", [[A, 3]]));
		expect(calls[0]).toMatchObject({ where: { available: { gte: 3 } }, delta: { available: { dec: 3 }, reserved: { inc: 3 } } });
		expect(await store.get(A)).toMatchObject({ available: 2, reserved: 0 });
	});
});

describe("declared storage indexes", () => {
	it("the fake rejects a query on an undeclared field, as EmDash does", async () => {
		const collection = declared<{ status: string; other: string }>(STORAGE.reservations);
		await expect(collection.query({ where: { other: "x" } })).rejects.toBeInstanceOf(FakeStorageQueryError);
		await expect(collection.query({ where: { status: "held" } })).resolves.toMatchObject({ items: [] });
	});

	it("declares a collection for every storage name", () => {
		expect(Object.keys(storageDeclaration).sort()).toEqual(Object.values(STORAGE).sort());
	});
});
