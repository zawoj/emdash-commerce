import { runMigrations } from "emdash/db";
import { createDialect } from "emdash/db/sqlite";
import { Kysely } from "kysely";

/**
 * A real EmDash database for tests: in-memory SQLite (`node:sqlite`, the driver EmDash itself uses), all core
 * migrations applied. The "real host" tests run the plugin's schema reconciler, stores and content
 * repositories against EmDash's own `SchemaRegistry`, `PluginStorageRepository` and content access, so they
 * exercise the actual SQL (guarded updates, expression-index queries, column types), not a model of it.
 * Native plugins have no official test host in emdash 1.5 (`emdash/internal/plugin-test-runtime` boots a whole
 * runtime), which is why the unit tests elsewhere use fakes and this layer proves the fakes right.
 */
export const createRealDatabase = async () => {
	const db = new Kysely<never>({ dialect: createDialect({ url: ":memory:" }) });
	await runMigrations(db as never);
	return db;
};

export type RealDatabase = Awaited<ReturnType<typeof createRealDatabase>>;
