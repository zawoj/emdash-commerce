import { describe, expect, it, vi } from "vitest";

import { commerceOptionsSchema } from "../../contracts/options.js";
import { buildCollectionDefinitions } from "../../adapters/emdash/schema/collections.js";
import { createFakePluginContext } from "../../testing/index.js";
import { resetContainerMemo, type ContainerDeps } from "../../plugin/container.js";
import { buildHooks } from "../../plugin/hooks.js";
import { resetEnsureSchemaMemo, type SchemaPort } from "../../adapters/emdash/schema/reconcile.js";
import { createInertSchemaPort } from "../../testing/fakes/schema-port.js";

const syncEntity = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("../catalog-sync.js", () => ({
	createCatalogSyncService: () => ({
		syncEntity,
		ensurePricesSynced: async () => new Map(),
		deactivateProduct: async () => {},
		handleProviderProductChanged: async () => {},
		handleProviderPriceChanged: async () => {},
		processDue: async () => 0,
		resync: async () => ({ queued: 0 }),
	}),
}));

const options = commerceOptionsSchema.parse({});
const definitions = buildCollectionDefinitions(options.collections, options.supportedCurrencies);

const schemaPort = (): SchemaPort => createInertSchemaPort();

describe("catalog hooks", () => {
	it("routes afterSave to syncEntity and swallows provider errors", async () => {
		resetEnsureSchemaMemo();
		resetContainerMemo();
		syncEntity.mockClear();
		syncEntity.mockRejectedValueOnce(new Error("provider down"));
		const deps: ContainerDeps = { createSchemaPort: async () => schemaPort() };
		const hooks = buildHooks(options, {}, deps);
		const ctx = createFakePluginContext(definitions);
		const afterSave = hooks["content:afterSave"]!;
		const run = typeof afterSave === "function" ? afterSave : afterSave.handler;
		await expect(run({ collection: options.collections.products, isNew: false, content: { id: "p1", title: "Mug" } }, ctx)).resolves.toBeUndefined();
		expect(syncEntity).toHaveBeenCalledWith({ entity: "product", id: "p1" });
	});
});
