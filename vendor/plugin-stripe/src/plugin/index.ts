import type { PluginContext, PluginDefinition } from "emdash";
import { definePlugin } from "emdash";

import { PLUGIN_ID, PLUGIN_VERSION } from "../adapters/emdash/constants.js";
import { mutableStorageDeclaration } from "../adapters/emdash/storage/declaration.js";
import type { CommerceExtensions } from "../contracts/extensions.js";
import type { CommerceOptionsInput } from "../contracts/options.js";
import type { ContainerDeps } from "./container.js";
import { buildAdminConfig } from "./admin.js";
import { buildCronHook, ensureCronScheduled } from "./cron.js";
import { buildHooks } from "./hooks.js";
import { mcpConfig } from "./mcp.js";
import { parseCommerceOptions } from "./options.js";
import { createRouteBuilder } from "./route-builder.js";
import { buildRoutes } from "./routes/index.js";

type Hooks = NonNullable<PluginDefinition["hooks"]>;
type LifecycleHook = Hooks["plugin:activate"];

/** A hook may be declared as a bare function or as `{ handler, ... }`; the lifecycle wrapper needs the function. */
const handlerOf = (hook: LifecycleHook): ((event: never, ctx: PluginContext) => Promise<void>) | null => {
	if (!hook) return null;
	return (typeof hook === "function" ? hook : hook.handler) as (event: never, ctx: PluginContext) => Promise<void>;
};

/** Runs the existing lifecycle hook, then (re)schedules the maintenance task; scheduling failures are logged, not thrown. */
const withCronScheduling = (hook: LifecycleHook): NonNullable<LifecycleHook> =>
	(async (event: never, ctx: PluginContext) => {
		await handlerOf(hook)?.(event, ctx);
		await ensureCronScheduled(ctx);
	}) as NonNullable<LifecycleHook>;

/**
 * Builds the commerce plugin. Options are validated here (a bad option stops startup with a readable
 * message). `extensions` are functions and cannot travel through EmDash's JSON descriptor options, so a site
 * that needs them calls this from its own entrypoint (see contracts/extensions.ts).
 *
 * Capabilities: content read/write/publish (catalog reads, record writes, publish of created records),
 * `content:revisions:read` (the protected-field guard and the editor panels read draft revisions), `email:send`
 * (order mails and access links), `hooks.content-policy:register` (the product publish policy: a product cannot go
 * live with a missing required specification, SKU or active variant). Cron needs none: `ctx.cron` is always available and scoped to the plugin. No `schema:read`:
 * schema changes go through `SchemaRegistry` directly, not through the plugin context. No `network:request`:
 * Stripe is called by the SDK's own fetch client, not by `ctx.http`.
 */
export const createStripeCommercePlugin = (options: CommerceOptionsInput = {}, extensions: CommerceExtensions = {}, deps: ContainerDeps = {}) => {
	const parsed = parseCommerceOptions(options);
	const builder = createRouteBuilder(parsed, extensions, deps);
	const hooks = buildHooks(parsed, extensions, deps);
	return definePlugin({
		id: PLUGIN_ID,
		displayName: "Stripe commerce",
		description: "Catalog, carts, Stripe Checkout, orders, payments, refunds and subscriptions",
		version: PLUGIN_VERSION,
		capabilities: ["content:read", "content:write", "content:publish", "content:revisions:read", "email:send", "hooks.content-policy:register"],
		storage: mutableStorageDeclaration(),
		admin: buildAdminConfig(parsed.collections),
		hooks: {
			...hooks,
			"plugin:install": withCronScheduling(hooks["plugin:install"]),
			"plugin:activate": withCronScheduling(hooks["plugin:activate"]),
			cron: buildCronHook(parsed, extensions, deps),
		},
		routes: buildRoutes(builder),
		mcp: mcpConfig,
	});
};

/** The `createPlugin(options)` entrypoint EmDash calls for a JSON plugin descriptor. */
export const createPlugin = (options: CommerceOptionsInput = {}) => createStripeCommercePlugin(options);
