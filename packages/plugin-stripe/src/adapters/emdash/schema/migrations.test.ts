import { describe, expect, it } from "vitest";

import { commerceOptionsSchema } from "../../../contracts/options.js";
import { createReadySchemaPort } from "../../../testing/fakes/schema-port.js";
import { createFakeKv } from "../../../testing/fakes/storage.js";
import { KV_KEY } from "../constants.js";
import { buildCollectionDefinitions, type FieldDefinition } from "./collections.js";
import { DATA_MIGRATIONS, runDataMigrations, type DataMigration, type MigrationContext } from "./migrations.js";

const options = commerceOptionsSchema.parse({});
const definitions = buildCollectionDefinitions(options.collections, options.supportedCurrencies);

type Validation = NonNullable<FieldDefinition["validation"]>;

const makeCtx = () => {
	const logs: Array<[string, string, unknown]> = [];
	const validations: Array<{ collection: string; field: string; validation: Validation }> = [];
	const port = { ...createReadySchemaPort(definitions), setFieldValidation: async (collection: string, field: string, validation: Validation) => {
		validations.push({ collection, field, validation });
		return true;
	} };
	const ctx: MigrationContext = {
		kv: createFakeKv(),
		plugin: null,
		log: { info: (m, d) => void logs.push(["info", m, d]), error: (m, d) => void logs.push(["error", m, d]) },
		collections: options.collections,
		definitions,
		schema: async () => port,
	};
	return { ctx, logs, validations };
};

const migration = (id: string, run: () => Promise<void> = async () => undefined): DataMigration & { runs: number } => {
	const item = {
		id,
		description: id,
		runs: 0,
		run: async () => {
			item.runs += 1;
			await run();
		},
	};
	return item;
};

describe("runDataMigrations", () => {
	it("runs each migration once, in id order, and marks it done", async () => {
		const { ctx } = makeCtx();
		const order: string[] = [];
		const second = migration("0002-b", async () => void order.push("b"));
		const first = migration("0001-a", async () => void order.push("a"));
		const result = await runDataMigrations(ctx, [second, first]);
		expect(order).toEqual(["a", "b"]);
		expect(result).toMatchObject({ ran: ["0001-a", "0002-b"], failed: null, isLocked: false });
		const again = await runDataMigrations(ctx, [second, first]);
		expect(again.ran).toEqual([]);
		expect(again.skipped).toEqual(["0001-a", "0002-b"]);
		expect(first.runs + second.runs).toBe(2);
		expect(await ctx.kv.get(KV_KEY.migrationsLock)).toBeNull();
	});

	it("a failing migration leaves its marker unset, is logged, stops the rest and never throws", async () => {
		const { ctx, logs } = makeCtx();
		const bad = migration("0002-bad", async () => {
			throw new Error("boom");
		});
		const later = migration("0003-later");
		const result = await runDataMigrations(ctx, [migration("0001-ok"), bad, later]);
		expect(result.ran).toEqual(["0001-ok"]);
		expect(result.failed).toEqual({ id: "0002-bad", message: "boom" });
		expect(later.runs).toBe(0);
		expect(await ctx.kv.get(KV_KEY.migrationDone("0002-bad"))).toBeNull();
		expect(logs.some(([level, message]) => level === "error" && /failed/.test(message))).toBe(true);
		expect(await ctx.kv.get(KV_KEY.migrationsLock)).toBeNull();
	});

	it("retries a failed migration on the next run", async () => {
		const { ctx } = makeCtx();
		let attempts = 0;
		const flaky = migration("0001-flaky", async () => {
			attempts += 1;
			if (attempts === 1) throw new Error("transient");
		});
		expect((await runDataMigrations(ctx, [flaky])).failed).not.toBeNull();
		expect((await runDataMigrations(ctx, [flaky])).ran).toEqual(["0001-flaky"]);
	});

	it("lets only one of several concurrent runners execute a migration", async () => {
		const { ctx } = makeCtx();
		const slow = migration("0001-slow", async () => {
			for (let index = 0; index < 5; index += 1) await Promise.resolve();
		});
		const results = await Promise.all([runDataMigrations(ctx, [slow]), runDataMigrations(ctx, [slow]), runDataMigrations(ctx, [slow])]);
		expect(slow.runs).toBe(1);
		expect(results.filter((result) => result.isLocked || result.ran.length === 0).length).toBeGreaterThanOrEqual(2);
	});

	it("reports a lock held by a live process and takes over a dead one", async () => {
		const { ctx } = makeCtx();
		await ctx.kv.set(KV_KEY.migrationsLock, { holder: "other", expiresAt: 10_000 });
		const blocked = migration("0001-a");
		expect((await runDataMigrations(ctx, [blocked], { now: () => 5_000 })).isLocked).toBe(true);
		expect(blocked.runs).toBe(0);
		const result = await runDataMigrations(ctx, [blocked], { now: () => 20_000 });
		expect(result.ran).toEqual(["0001-a"]);
	});

	it("ships a numbered baseline migration with unique ids", async () => {
		expect(new Set(DATA_MIGRATIONS.map((item) => item.id)).size).toBe(DATA_MIGRATIONS.length);
		for (const item of DATA_MIGRATIONS) expect(item.id).toMatch(/^\d{4}-[a-z0-9-]+$/);
		const { ctx } = makeCtx();
		expect((await runDataMigrations(ctx)).failed).toBeNull();
	});
});

describe("0002-optional-option-sub-fields", () => {
	const run = DATA_MIGRATIONS.find((item) => item.id === "0002-optional-option-sub-fields")!.run;

	it("is a no-op in the catalog v2 model: the option repeaters are gone and the relation field's validation is never rewritten", async () => {
		const { ctx, validations } = makeCtx();
		await run(ctx);
		expect(validations).toEqual([]);
	});

	it("uses no collection slug at all, so a renamed catalog is untouched too", async () => {
		const { ctx, validations } = makeCtx();
		const renamed = { ...options.collections, products: "shop_products", variants: "shop_variants" };
		await run({ ...ctx, collections: renamed, definitions: buildCollectionDefinitions(renamed, options.supportedCurrencies) });
		expect(validations).toEqual([]);
	});
});

describe("collection definitions", () => {
	it("keep every repeater sub-field optional, because EmDash validates draft autosaves", () => {
		const subFields = definitions.flatMap((definition) => definition.fields.flatMap((field) => field.validation?.subFields ?? []));
		expect(subFields.length).toBeGreaterThan(0);
		expect(subFields.filter((subField) => subField.required)).toEqual([]);
	});
});
