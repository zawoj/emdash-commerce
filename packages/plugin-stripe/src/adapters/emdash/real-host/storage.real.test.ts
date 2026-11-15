import { PluginStorageRepository } from "emdash";

import { createFixedClock } from "../../../testing/clock.js";
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
import { createFakeKv } from "../../../testing/fakes/storage.js";
import { STORAGE, type StorageName } from "../constants.js";
import { storageDeclaration } from "../storage/declaration.js";
import { createEventOutbox } from "../storage/event-outbox.js";
import { createInventoryStore } from "../storage/inventory-store.js";
import { createRecordIndex } from "../storage/record-index.js";
import { createCartStore, createCatalogLinkStore, createCheckoutSnapshotStore, createRateLimiter, createRefundStore } from "../storage/simple-stores.js";
import { createWebhookInbox } from "../storage/webhook-inbox.js";
import { createRealDatabase } from "./host.js";

const db = await createRealDatabase();
let instance = 0;

/** A fresh plugin namespace per test, constructed with exactly the plugin's declared indexes. */
const collection = <T>(name: StorageName) =>
	new PluginStorageRepository<T>(db as never, `contract-${(instance += 1)}`, name, [...storageDeclaration[name].indexes]);

const label = "EmDash PluginStorageRepository on SQLite";

inventoryContract(label, () => {
	const clock = createFixedClock();
	return { store: createInventoryStore(collection(STORAGE.inventory), collection(STORAGE.reservations), clock), clock };
});
recordIndexContract(label, () => {
	const clock = createFixedClock();
	return { index: createRecordIndex(collection(STORAGE.recordIndex), clock), clock };
});
cartStoreContract(label, () => ({ store: createCartStore(collection(STORAGE.carts)) }));
catalogLinkStoreContract(label, () => ({ store: createCatalogLinkStore(collection(STORAGE.catalogLinks)), clock: createFixedClock() }));
snapshotStoreContract(label, () => ({ store: createCheckoutSnapshotStore(collection(STORAGE.checkoutSnapshots)) }));
refundStoreContract(label, () => ({ store: createRefundStore(collection(STORAGE.refunds)) }));
webhookInboxContract(label, () => {
	const clock = createFixedClock();
	return { inbox: createWebhookInbox(collection(STORAGE.webhookInbox), createFakeKv(), clock), clock };
});
eventOutboxContract(label, () => {
	const clock = createFixedClock();
	return { outbox: createEventOutbox(collection(STORAGE.eventOutbox), clock), clock };
});
rateLimiterContract(label, () => {
	const clock = createFixedClock();
	return { limiter: createRateLimiter(collection(STORAGE.rateLimits), clock), clock };
});
