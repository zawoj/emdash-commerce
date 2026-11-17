import type { ContentDeleteEvent, ContentHookEvent, ContentPolicyEvent, ContentPublishStateChangeEvent, PluginContext, PluginDefinition } from "emdash";

import { asInt } from "../adapters/emdash/content/values.js";
import { createBaselineLoader } from "../adapters/emdash/content/baselines.js";
import { buildCollectionDefinitions } from "../adapters/emdash/schema/collections.js";
import { SaveRejectedError, createProtectedFieldGuard } from "../adapters/emdash/schema/guard.js";
import { buildCollectionPolicies } from "../adapters/emdash/schema/protected-fields.js";
import { VARIANT_FIELD } from "../adapters/emdash/schema/field-names.js";
import { ensureAccessTokenSecret } from "../adapters/emdash/settings.js";
import type { CommerceExtensions } from "../contracts/extensions.js";
import type { CommerceOptions } from "../contracts/options.js";
import type { SellableRef } from "../core/catalog.js";
import { INVENTORY_ADJUSTMENT_REASON } from "../core/inventory.js";
import { webCryptoIdGenerator } from "../core/ids.js";
import { createCatalogSyncService } from "../services/catalog-sync.js";
import { deriveVariantFields } from "../services/catalog/derive-variant.js";
import { checkPriceLinks } from "../services/catalog/price-links.js";
import { syncManagedPrices } from "../services/catalog/managed-prices.js";
import { productPublishRefusal } from "../services/catalog/publish-guard.js";
import { catalogSaveProblems } from "../services/catalog/save-checks.js";
import type { CatalogEntityRef } from "../services/contracts.js";
import { createEventPublisher } from "../services/outbox.js";
import { createContainer, type CommerceContainer, type ContainerDeps } from "./container.js";

type Hooks = NonNullable<PluginDefinition["hooks"]>;

/** Links one delete pass settles at most (a product with many variants and prices); the rest wait for cron. */
const DELETE_SETTLE_LIMIT = 100;

/**
 * Install and activate bring the schema up to date and run data migrations (both inside
 * `ensureReady`), and make sure the token secret exists. A failure is logged, not thrown: the same steps run again lazily on first use
 * (`container.ensureReady()`), so a transient database error at boot must not keep the plugin from loading.
 */
const prepare = (options: CommerceOptions, extensions: CommerceExtensions, deps: ContainerDeps) => async (ctx: PluginContext): Promise<void> => {
	try {
		await createContainer(ctx, options, extensions, deps).ensureReady();
	} catch (error) {
		ctx.log.error("Commerce schema or migration setup failed; it will be retried on first use", { error: error instanceof Error ? error.message : String(error) });
	}
	await ensureAccessTokenSecret(ctx.settings, deps.ids ?? webCryptoIdGenerator, ctx.log, deps.env);
};

const catalogEntityOf = (slugs: CommerceOptions["collections"], event: ContentHookEvent | ContentPublishStateChangeEvent | ContentDeleteEvent): CatalogEntityRef | null => {
	const collection = event.collection;
	const id = "id" in event ? event.id : (event.content.id as string | undefined);
	if (!id) return null;
	if (collection === slugs.products) return { entity: "product", id };
	if (collection === slugs.variants) return { entity: "variant", id };
	if (collection === slugs.prices) return { entity: "price", id };
	return null;
};

const runCatalogHook = async (
	ctx: PluginContext,
	options: CommerceOptions,
	extensions: CommerceExtensions,
	deps: ContainerDeps,
	work: (service: ReturnType<typeof createCatalogSyncService>) => Promise<void>,
): Promise<void> => {
	try {
		const container = createContainer(ctx, options, extensions, deps);
		await container.ensureReady();
		await work(createCatalogSyncService(container, createEventPublisher(container)));
	} catch (error) {
		ctx.log.error("Catalog hook failed; it will be retried by cron", { error: error instanceof Error ? error.message : String(error) });
	}
};

const isFieldRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const variantStockDelta = async (container: ReturnType<typeof createContainer>, event: ContentHookEvent, slugs: CommerceOptions["collections"]): Promise<void> => {
	if (event.collection !== slugs.variants || !event.content.id) return;
	const variantId = String(event.content.id);
	// afterSave receives the whole entry (`{ id, type, slug, status, data }`, emdash `contentItemToRecord`); the fields
	// are under `data`. beforeSave is different: it receives the field values themselves.
	const fields = isFieldRecord(event.content.data) ? event.content.data : event.content;
	const stock = asInt(fields[VARIANT_FIELD.stock]);
	if (stock === null || stock < 0) return;
	const level = await container.inventory.get({ kind: "variant", id: variantId });
	const mirrored = level?.mirroredOnHand ?? 0;
	if (stock === mirrored) return;
	// What the editor typed minus what we last wrote into the field is the editor's change; sales since then stay.
	const sellable: SellableRef = { kind: "variant", id: variantId };
	await container.inventory.adjust(sellable, stock - mirrored, INVENTORY_ADJUSTMENT_REASON.editorEdit);
	await container.inventory.setMirroredOnHand(sellable, stock);
};

/**
 * The publish policy for products (`content:beforePublish` and `content:beforeSchedule`, which need the
 * `hooks.content-policy:register` capability): a refusal is a readable message the editor sees. The event carries the
 * draft the editor is publishing; see `productPublishRefusal`.
 */
const publishPolicy = (options: CommerceOptions, extensions: CommerceExtensions, deps: ContainerDeps) => async (event: ContentPolicyEvent, ctx: PluginContext): Promise<{ cancel: true; reason: string } | void> => {
	if (event.collection !== options.collections.products) return;
	const container = createContainer(ctx, options, extensions, deps);
	await container.ensureReady();
	const reason = await productPublishRefusal(container, event.content);
	if (reason) return { cancel: true, reason };
};

/**
 * Content hooks: the protected-field guard and the catalog field checks (beforeSave), the publish policy for products,
 * catalog sync and the editor stock delta (after save, publish, unpublish and delete). The cron orchestration (inbox retries, outbox delivery, reservation
 * expiry, cart sweep) lives in `plugin/cron.ts`; an empty hook is never registered, because each one costs
 * EmDash a dispatch on every save and tick.
 */
export const buildHooks = (options: CommerceOptions, extensions: CommerceExtensions, deps: ContainerDeps = {}): Hooks => {
	const policies = buildCollectionPolicies(buildCollectionDefinitions(options.collections, options.supportedCurrencies), options.collections);
	const slugs = options.collections;
	const run = prepare(options, extensions, deps);

	return {
		"plugin:install": async (_event, ctx) => run(ctx),
		"plugin:activate": async (_event, ctx) => run(ctx),
		// Throwing aborts the save (default errorPolicy "abort"); SaveRejectedError is shown to the editor.
		"content:beforeSave": async (event, ctx) => {
			if (!(event.collection in policies)) return;
			const guard = createProtectedFieldGuard(policies, createBaselineLoader(ctx.content));
			await guard({ collection: event.collection, isNew: event.isNew, id: event.id, actor: event.actor, content: event.content });
			const problems = catalogSaveProblems(slugs, event.collection, event.content);
			if (problems.length > 0) throw new SaveRejectedError(problems.join(" "));
		},
		"content:beforePublish": publishPolicy(options, extensions, deps),
		"content:beforeSchedule": publishPolicy(options, extensions, deps),
		/**
		 * After-save shapes: emdash `plugins/types.ts` — `ContentHookEvent` (`content`, `collection`, `isNew`,
		 * optional `id` on beforeSave only; afterSave uses `content.id`), optional `actor` / `editedBy`.
		 */
		"content:afterSave": async (event, ctx) => {
			const container = createContainer(ctx, options, extensions, deps);
			try {
				await container.ensureReady();
				await variantStockDelta(container, event, slugs);
			} catch (error) {
				ctx.log.error("Variant stock mirror failed", { error: error instanceof Error ? error.message : String(error) });
			}
			const ref = catalogEntityOf(slugs, event);
			if (!ref) return;
			await runCatalogHook(ctx, options, extensions, deps, async (service) => {
				// The relation selections of a variant or a price are visible only after the save, so what depends on
				// them (derived fields, the exactly-one-parent rule) is settled here, before the entity goes to Stripe.
				const container = createContainer(ctx, options, extensions, deps);
				if (ref.entity === "variant") await deriveVariantFields(container, ref.id);
				if (ref.entity === "price" && !(await checkPriceLinks(container, ref.id))) return;
				// The managed price entries follow the product / variant `price` before the entity goes to Stripe.
				await syncManagedPrices(container, ref);
				await service.syncEntity(ref);
			});
		},
		"content:afterPublish": async (event, ctx) => {
			const ref = catalogEntityOf(slugs, event);
			if (!ref || ref.entity !== "product") return;
			// Publishing makes the draft's price live, so the managed prices are settled again here.
			await runCatalogHook(ctx, options, extensions, deps, async (service) => {
				await syncManagedPrices(createContainer(ctx, options, extensions, deps), ref);
				await service.syncEntity(ref);
			});
		},
		"content:afterUnpublish": async (event, ctx) => {
			const ref = catalogEntityOf(slugs, event);
			if (!ref || ref.entity !== "product") return;
			const id = String(event.content.id);
			await runCatalogHook(ctx, options, extensions, deps, (service) => service.deactivateProduct(id));
		},
		/**
		 * Trash fires `beforeDelete` and `afterDelete` (`permanent: false`); after it the entry and everything hanging off
		 * it are unreadable, so the dependents are marked pending while they can still be listed, and `afterDelete`
		 * settles every due link (the entity's own, its variants', its prices') by link. Whatever fails stays due for cron.
		 */
		"content:beforeDelete": async (event, ctx) => {
			const ref = catalogEntityOf(slugs, event);
			if (!ref) return;
			await runCatalogHook(ctx, options, extensions, deps, (service) => service.prepareDelete(ref));
		},
		"content:afterDelete": async (event, ctx) => {
			const ref = catalogEntityOf(slugs, event);
			if (!ref) return;
			await runCatalogHook(ctx, options, extensions, deps, async (service) => {
				await service.archiveDeleted(ref);
				await service.processDue(DELETE_SETTLE_LIMIT);
			});
		},
	};
};
