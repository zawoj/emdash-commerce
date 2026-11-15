/**
 * In-memory implementations of every persistence port, a fixed clock and a seeded id generator.
 * Service tests (this package's and a site's) run against these: they follow the same rules as the
 * production stores (compare-and-set revisions, `claim` winner and loser, idempotent inventory
 * commit and release, all-or-nothing reserve), and the contract suites in this package run the same
 * assertions against both.
 */
import { buildSchemaDefinitions, type SchemaDefinitions } from "../adapters/emdash/schema/collections/index.js";
import { commerceOptionsSchema } from "../contracts/options.js";
import type { IdGenerator } from "../core/ids.js";
import type { Clock, Logger } from "../ports/repositories.js";
import { createFixedClock, createNullLogger, createSeededIdGenerator, type FixedClock } from "./clock.js";
import { createInMemoryInventoryStore } from "./in-memory/inventory-store.js";
import { createInMemoryRecordIndex } from "./in-memory/record-index.js";
import { createInMemoryRelations } from "./in-memory/relations.js";
import {
	createInMemoryCartMirror,
	createInMemoryCatalog,
	createInMemoryCustomers,
	createInMemoryOrders,
	createInMemoryPayments,
	createInMemorySubscriptions,
} from "./in-memory/repositories.js";
import {
	createInMemoryCartStore,
	createInMemoryCatalogLinkStore,
	createInMemoryCheckoutSnapshotStore,
	createInMemoryEventOutbox,
	createInMemoryRateLimiter,
	createInMemoryRefundStore,
	createInMemoryWebhookInbox,
} from "./in-memory/stores.js";

export { createFakeContent, type FakeContent } from "./fakes/content.js";
export { createFakePluginContext, createFakeRouteContext, type FakePluginContext } from "./fakes/plugin-context.js";
export { createFakeKv, createFakeStorage, type FakeStorageCollection } from "./fakes/storage.js";
export { createFixedClock, createNullLogger, createSeededIdGenerator, type FixedClock } from "./clock.js";
export { createInMemoryInventoryStore, createInMemoryRecordIndex, createInMemoryRelations };
export type { InMemoryRelations } from "./in-memory/relations.js";
export {
	createInMemoryCartMirror,
	createInMemoryCatalog,
	createInMemoryCustomers,
	createInMemoryOrders,
	createInMemoryPayments,
	createInMemorySubscriptions,
	type InMemoryCartMirror,
	type InMemoryCatalog,
} from "./in-memory/repositories.js";
export {
	createInMemoryCartStore,
	createInMemoryCatalogLinkStore,
	createInMemoryCheckoutSnapshotStore,
	createInMemoryEventOutbox,
	createInMemoryRateLimiter,
	createInMemoryRefundStore,
	createInMemoryWebhookInbox,
} from "./in-memory/stores.js";

/** Every port wired to fresh in-memory state sharing one clock. */
export interface InMemoryWorld {
	clock: FixedClock;
	ids: IdGenerator;
	log: Logger;
	catalog: ReturnType<typeof createInMemoryCatalog>;
	catalogLinks: ReturnType<typeof createInMemoryCatalogLinkStore>;
	carts: ReturnType<typeof createInMemoryCartStore>;
	cartMirror: ReturnType<typeof createInMemoryCartMirror>;
	snapshots: ReturnType<typeof createInMemoryCheckoutSnapshotStore>;
	inventory: ReturnType<typeof createInMemoryInventoryStore>;
	recordIndex: ReturnType<typeof createInMemoryRecordIndex>;
	orders: ReturnType<typeof createInMemoryOrders>;
	payments: ReturnType<typeof createInMemoryPayments>;
	refunds: ReturnType<typeof createInMemoryRefundStore>;
	subscriptions: ReturnType<typeof createInMemorySubscriptions>;
	customers: ReturnType<typeof createInMemoryCustomers>;
	inbox: ReturnType<typeof createInMemoryWebhookInbox>;
	outbox: ReturnType<typeof createInMemoryEventOutbox>;
	rateLimiter: ReturnType<typeof createInMemoryRateLimiter>;
	/** Links between collections; knows the default collection slugs unless `schema` is passed. */
	relations: ReturnType<typeof createInMemoryRelations>;
}

export const createInMemoryWorld = (options: { clock?: Clock & Partial<FixedClock>; seed?: number; schema?: SchemaDefinitions } = {}): InMemoryWorld => {
	const clock = (options.clock as FixedClock | undefined) ?? createFixedClock();
	const ids = createSeededIdGenerator(options.seed ?? 1);
	return {
		clock,
		ids,
		log: createNullLogger(),
		catalog: createInMemoryCatalog(),
		catalogLinks: createInMemoryCatalogLinkStore(),
		carts: createInMemoryCartStore(),
		cartMirror: createInMemoryCartMirror(),
		snapshots: createInMemoryCheckoutSnapshotStore(),
		inventory: createInMemoryInventoryStore(clock),
		recordIndex: createInMemoryRecordIndex(clock),
		orders: createInMemoryOrders(ids),
		payments: createInMemoryPayments(ids),
		refunds: createInMemoryRefundStore(),
		subscriptions: createInMemorySubscriptions(ids),
		customers: createInMemoryCustomers(ids),
		inbox: createInMemoryWebhookInbox(clock),
		outbox: createInMemoryEventOutbox(clock),
		rateLimiter: createInMemoryRateLimiter(clock),
		relations: createInMemoryRelations(options.schema ?? buildSchemaDefinitions(commerceOptionsSchema.parse({}))),
	};
};
export * from "./fake-provider.js";
