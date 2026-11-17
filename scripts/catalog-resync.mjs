#!/usr/bin/env node
/**
 * Drives the Stripe catalog resync of a site to the end: queues every catalog link (`admin/catalog/resync`) and runs
 * `admin/catalog/sync` until nothing is due. Use it after `emdash site import` (an export carries no Stripe ids: they
 * live in plugin storage) or whenever the Commerce page shows catalog entities as pending.
 *
 * Usage:  pnpm catalog:resync
 * Env:    EMDASH_URL, EMDASH_TOKEN, SEED_SYNC_TIMEOUT_SECONDS: as for `pnpm seed`. The token needs the `admin` scope
 *         (the plugin's admin routes). Without a token the dev login of `astro dev` is used.
 * Exit:   0 synced; 1 anything else (no key, not a sandbox key, timeout, failures, no access).
 */
import { AUTH_MODE, createClient, preflightScopes, resolveTarget, SeedAccessError } from "./lib/emdash-client.mjs";
import { syncStripeCatalog } from "./lib/sync-stripe-catalog.mjs";

const PLUGIN = "stripe-commerce";
const TIMEOUT_MS = Math.max(10, Number(process.env.SEED_SYNC_TIMEOUT_SECONDS ?? 300)) * 1000;

const main = async () => {
	const client = createClient({ target: resolveTarget() });
	await client.login();
	if (client.mode === AUTH_MODE.TOKEN) await preflightScopes(client, ["admin"]);
	const outcome = await syncStripeCatalog({ call: client.call, plugin: PLUGIN, timeoutMs: TIMEOUT_MS });
	if (outcome !== "synced") process.exitCode = 1;
};

main().catch((error) => {
	console.error(error instanceof SeedAccessError ? `catalog:resync: ${error.message}` : error instanceof Error ? error.message : error);
	process.exit(1);
});
