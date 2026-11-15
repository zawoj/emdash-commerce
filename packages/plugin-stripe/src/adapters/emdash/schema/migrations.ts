import type { KVAccess } from "emdash";

import type { CommerceOptions } from "../../../contracts/options.js";
import { KV_KEY } from "../constants.js";
import type { CollectionDefinition } from "./collections.js";
import type { SchemaPort } from "./reconcile.js";

/**
 * Numbered, run-once data migrations (the schema reconciler handles structure; these handle data: backfills,
 * renamed values). Each runs under one KV lock; success writes a marker, failure leaves it unset and is
 * logged, so the next activation or first use retries. A failing migration never throws out of the runner
 * and never disables the plugin: later migrations are skipped (they may depend on it) and requests keep working.
 */

export interface MigrationContext {
	kv: KVAccess;
	log: { info(message: string, data?: unknown): void; error(message: string, data?: unknown): void };
	/** The full plugin context, for migrations that read or write content or storage. */
	plugin: unknown;
	/** The configured collection slugs and this release's definitions of them. */
	collections: CommerceOptions["collections"];
	definitions: readonly CollectionDefinition[];
	/** Opens the schema port (lazily: most runs have nothing pending). */
	schema: () => Promise<SchemaPort>;
}

/**
 * Rewrites one field's validation to this release's definition. A missing collection or field is not an error:
 * the reconciler creates it from the same definition.
 */
const applyFieldValidation = async (ctx: MigrationContext, collectionSlug: string, fieldSlug: string): Promise<void> => {
	const definition = ctx.definitions.find((candidate) => candidate.slug === collectionSlug);
	const validation = definition?.fields.find((field) => field.slug === fieldSlug)?.validation;
	// A field a later release removed has nothing left to fix (the catalog v2 model dropped the option repeaters).
	if (!validation) return;
	await (await ctx.schema()).setFieldValidation(collectionSlug, fieldSlug, validation);
};

export interface DataMigration {
	/** Zero-padded and unique, e.g. "0001-baseline"; runs in id order. */
	id: string;
	description: string;
	run(ctx: MigrationContext): Promise<void>;
}

/** Ordered registry. Add new migrations at the end; never edit or reorder a released one. */
export const DATA_MIGRATIONS: readonly DataMigration[] = [
	{
		id: "0001-baseline",
		description: "Marks the 0.2 data model as the baseline; nothing to convert (the 0.1 prototype data was wiped).",
		run: async () => undefined,
	},
	{
		id: "0002-optional-option-sub-fields",
		description:
			"Product option rows and variant option value rows no longer require their sub-fields, so a draft autosave right after an editor adds an empty row succeeds.",
		// The option repeaters are gone in the catalog v2 model (`option_values` is now a relation field whose validation
		// must not be rewritten), so there is nothing left to convert.
		run: async () => undefined,
	},
];

interface LockValue {
	holder: string;
	expiresAt: number;
}

const LOCK_TTL_MS = 120_000;

export interface MigrationRunResult {
	ran: string[];
	skipped: string[];
	failed: { id: string; message: string } | null;
	/** True when another process held the lock; it will run them. */
	isLocked: boolean;
}

export const runDataMigrations = async (
	ctx: MigrationContext,
	migrations: readonly DataMigration[] = DATA_MIGRATIONS,
	deps: { now?: () => number; holder?: string } = {},
): Promise<MigrationRunResult> => {
	const now = deps.now ?? Date.now;
	const holder = deps.holder ?? globalThis.crypto.randomUUID();
	const result: MigrationRunResult = { ran: [], skipped: [], failed: null, isLocked: false };
	const ordered = [...migrations].sort((a, b) => a.id.localeCompare(b.id));

	const pending: DataMigration[] = [];
	for (const migration of ordered) {
		if (await ctx.kv.get(KV_KEY.migrationDone(migration.id))) result.skipped.push(migration.id);
		else pending.push(migration);
	}
	if (pending.length === 0) return result;

	const claim: LockValue = { holder, expiresAt: now() + LOCK_TTL_MS };
	let hasLock = (await ctx.kv.compareAndSet(KV_KEY.migrationsLock, null, claim)).applied;
	if (!hasLock) {
		const current = await ctx.kv.getVersioned<LockValue>(KV_KEY.migrationsLock);
		hasLock = current !== null && current.value.expiresAt <= now() && (await ctx.kv.compareAndSet(KV_KEY.migrationsLock, current.revision, claim)).applied;
	}
	if (!hasLock) return { ...result, isLocked: true };

	try {
		for (const migration of pending) {
			// Re-check under the lock: a process that held it before us may have finished this one.
			if (await ctx.kv.get(KV_KEY.migrationDone(migration.id))) {
				result.skipped.push(migration.id);
				continue;
			}
			try {
				await migration.run(ctx);
				await ctx.kv.set(KV_KEY.migrationDone(migration.id), { at: new Date(now()).toISOString() });
				result.ran.push(migration.id);
				ctx.log.info("Commerce data migration applied", { id: migration.id });
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				result.failed = { id: migration.id, message };
				ctx.log.error("Commerce data migration failed; it will be retried", { id: migration.id, message });
				break;
			}
		}
	} finally {
		const current = await ctx.kv.getVersioned<LockValue>(KV_KEY.migrationsLock);
		if (current?.value.holder === holder) await ctx.kv.compareAndDelete(KV_KEY.migrationsLock, current.revision);
	}
	return result;
};
