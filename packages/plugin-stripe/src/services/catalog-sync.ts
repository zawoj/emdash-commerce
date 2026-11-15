import { commerceEventId, type AnyCommerceEvent } from "../core/events.js";
import { priceTermsFingerprint, type Price } from "../core/catalog.js";
import { ProviderError } from "../ports/payment-provider.js";
import type { CatalogLink, CatalogRepository } from "../ports/repositories.js";
import type { CatalogEntityRef, CatalogSyncService, EventPublisher } from "./contracts.js";
import { isPriceSellable } from "./catalog/active.js";
import { catalogNextAttemptAt } from "./catalog/backoff.js";
import { driftFieldsForPrice, driftFieldsForProduct, recordDrift } from "./catalog/drift.js";
import { entityKeyOf, parseEntityKey, priceEntityKey, productEntityKey, variantEntityKey } from "./catalog/entity-keys.js";
import { loadLink, markFailed, markPending } from "./catalog/link-mutate.js";
import { archiveDeletedEntity } from "./catalog/archive-deleted.js";
import { archivePriceEntity, syncPriceEntity } from "./catalog/sync-price.js";
import { archiveProductEntity, syncProductEntity } from "./catalog/sync-product.js";
import { archiveVariantEntity, syncVariantEntity } from "./catalog/sync-variant.js";
import type { CommerceContainer } from "../plugin/container.js";

const syncFailedEvent = (ref: CatalogEntityRef, error: string, attempt: number, occurredAt: string): AnyCommerceEvent => ({
	id: commerceEventId("catalog.sync_failed", `${ref.entity}:${ref.id}:${attempt}`),
	type: "catalog.sync_failed",
	occurredAt,
	data: { entity: ref.entity, id: ref.id, error },
});

const dependentsOfProduct = async (catalog: CatalogRepository, productId: string): Promise<CatalogEntityRef[]> => {
	const variants = await catalog.listVariants(productId);
	const prices = await catalog.listPrices(productId);
	return [
		{ entity: "product", id: productId },
		...variants.map((variant) => ({ entity: "variant" as const, id: variant.id })),
		...prices.map((price) => ({ entity: "price" as const, id: price.id })),
	];
};

/** A synced price link for these terms whose last write left the Stripe price active. */
const isServable = (link: CatalogLink, fingerprint: string): boolean =>
	link.syncStatus === "synced" && link.providerId !== null && link.fingerprint === fingerprint && link.lastWritten?.isActive === true;

/** A variant's own prices follow its active flag (an inactive variant sells nothing), so they sync with it. */
const dependentsOfVariant = async (catalog: CatalogRepository, variantId: string): Promise<CatalogEntityRef[]> => {
	const variant = await catalog.getVariant(variantId);
	const prices = variant ? await catalog.listPrices(variant.productId) : [];
	return [
		{ entity: "variant", id: variantId },
		...prices.filter((price) => price.variantId === variantId).map((price) => ({ entity: "price" as const, id: price.id })),
	];
};

const priceContext = async (catalog: CatalogRepository, price: Price) => {
	const product = await catalog.getProduct(price.productId);
	if (!product) return null;
	const variant = price.variantId ? await catalog.getVariant(price.variantId) : null;
	if (price.variantId && !variant) return null;
	return { product, variant, price };
};

export const createCatalogSyncService = (container: CommerceContainer, publisher: EventPublisher): CatalogSyncService => {
	const { catalog, catalogLinks, clock, log, catalogMirror: mirror } = container;

	/**
	 * The entity (or the parent it hangs off) is gone from content, so there is nothing to sync: the link settles by
	 * archiving whatever it points to in Stripe. A silent return here would leave the link pending, due since the epoch,
	 * and cron would pick it up on every tick without ever finishing it (and spend its `limit` on it).
	 */
	const settleMissing = async (entityKey: string, entity: CatalogEntityRef["entity"]): Promise<void> => {
		const provider = (await container.provider()).catalog;
		await archiveDeletedEntity(provider, catalogLinks, clock, entityKey, entity === "price" ? "price" : "product");
		if (entity === "price") await mirror.writePriceActive(parseEntityKey(entityKey)!.id, false);
	};

	const attemptEntity = async (entityKey: string): Promise<void> => {
		const parsed = parseEntityKey(entityKey);
		if (!parsed) return;
		const payment = await container.provider();
		const catalogProvider = payment.catalog;

		if (parsed.entity === "product") {
			const product = await catalog.getProduct(parsed.id);
			if (!product) return settleMissing(entityKey, "product");
			if (!product.isPublished) {
				await deactivateProductTree(parsed.id);
				return;
			}
			await syncProductEntity(catalogProvider, catalogLinks, clock, entityKey, product);
			return;
		}

		if (parsed.entity === "variant") {
			const variant = await catalog.getVariant(parsed.id);
			if (!variant) return settleMissing(entityKey, "variant");
			const product = await catalog.getProduct(variant.productId);
			if (!product) return settleMissing(entityKey, "variant");
			await syncProductEntity(catalogProvider, catalogLinks, clock, productEntityKey(product.id), product);
			if (!product.isPublished || !variant.isActive) {
				await archiveVariantEntity(catalogProvider, catalogLinks, clock, entityKey, product, variant, mirror);
				return;
			}
			await syncVariantEntity(catalogProvider, catalogLinks, clock, entityKey, product, variant, mirror);
			return;
		}

		const price = await catalog.getPrice(parsed.id);
		if (!price) return settleMissing(entityKey, "price");
		const ctx = await priceContext(catalog, price);
		if (!ctx) return settleMissing(entityKey, "price");
		const parentKey = price.variantId ? variantEntityKey(price.variantId) : productEntityKey(price.productId);
		await attemptEntity(parentKey);
		if (!price.isActive || !ctx.product.isPublished || (ctx.variant && !ctx.variant.isActive)) {
			await archivePriceEntity(catalogProvider, catalogLinks, clock, price, mirror);
			return;
		}
		await syncPriceEntity(catalogProvider, catalogLinks, clock, ctx.product, ctx.variant, price, mirror);
	};

	const linkOfSnapshot = async (providerId: string, entityKey: string): Promise<CatalogLink | null> =>
		(await catalogLinks.findByProviderId(providerId)) ?? (await catalogLinks.get(entityKey))?.value ?? null;

	const dependentsOf = async (ref: CatalogEntityRef): Promise<CatalogEntityRef[]> => {
		if (ref.entity === "product") return dependentsOfProduct(catalog, ref.id);
		if (ref.entity === "variant") return dependentsOfVariant(catalog, ref.id);
		return [ref];
	};

	const finishFailure = async (entityKey: string, ref: CatalogEntityRef, error: unknown): Promise<void> => {
		const message = error instanceof Error ? error.message : String(error);
		const { link } = await loadLink(catalogLinks, entityKey);
		const attempts = link.attempts + 1;
		const nextAttemptAt = catalogNextAttemptAt(attempts, clock.now());
		await markFailed(catalogLinks, entityKey, message, attempts, nextAttemptAt);
		await publisher.publish([syncFailedEvent(ref, message, attempts, clock.now().toISOString())]);
		const parsed = parseEntityKey(entityKey);
		if (parsed?.entity === "variant") {
			await mirror.writeVariantSync(parsed.id, { stripeProductId: link.providerId, stripeSyncStatus: "failed", stripeSyncError: message });
		}
		if (parsed?.entity === "price") {
			await mirror.writePriceSync(parsed.id, { stripePriceId: link.providerId, stripeSyncStatus: "failed", stripeSyncError: message });
		}
	};

	const runAttempt = async (entityKey: string, ref: CatalogEntityRef): Promise<void> => {
		try {
			await attemptEntity(entityKey);
		} catch (error) {
			if (error instanceof ProviderError) {
				await finishFailure(entityKey, ref, error);
				return;
			}
			log.error("Catalog sync failed with a non-provider error", { entityKey, error: error instanceof Error ? error.message : String(error) });
			await finishFailure(entityKey, ref, error);
		}
	};

	const deactivateProductTree = async (productId: string): Promise<void> => {
		const payment = await container.provider();
		const catalogProvider = payment.catalog;
		const product = await catalog.getProduct(productId);
		if (!product) return;
		await archiveProductEntity(catalogProvider, catalogLinks, clock, productEntityKey(productId), product);
		const variants = await catalog.listVariants(productId);
		for (const variant of variants) {
			await archiveVariantEntity(catalogProvider, catalogLinks, clock, variantEntityKey(variant.id), product, variant, mirror);
		}
		const prices = await catalog.listPrices(productId);
		for (const price of prices) {
			await archivePriceEntity(catalogProvider, catalogLinks, clock, price, mirror);
		}
	};

	return {
		async syncEntity(ref) {
			const refs = await dependentsOf(ref);
			for (const dependent of refs) {
				await markPending(catalogLinks, entityKeyOf(dependent));
			}
			for (const dependent of refs) {
				await runAttempt(entityKeyOf(dependent), dependent);
			}
		},

		async ensurePricesSynced(priceIds) {
			const result = new Map<string, string | null>();
			for (const priceId of priceIds) {
				const price = await catalog.getPrice(priceId);
				if (!price) {
					result.set(priceId, null);
					continue;
				}
				const ctx = await priceContext(catalog, price);
				if (!ctx || !isPriceSellable(ctx.product, ctx.variant, price)) {
					result.set(priceId, null);
					continue;
				}
				const fingerprint = priceTermsFingerprint(price);
				// Fast path (every checkout): a synced link for the current terms whose last write left the price
				// active needs no provider call at all.
				const known = (await catalogLinks.get(priceEntityKey(priceId)))?.value;
				if (known && isServable(known, fingerprint)) {
					result.set(priceId, known.providerId);
					continue;
				}
				try {
					await attemptEntity(priceEntityKey(priceId));
				} catch (error) {
					if (error instanceof ProviderError) throw error;
					throw new ProviderError(error instanceof Error ? error.message : "Catalog sync failed", { isRetryable: true });
				}
				const link = (await catalogLinks.get(priceEntityKey(priceId)))?.value;
				result.set(priceId, link && link.fingerprint === fingerprint && link.providerId ? link.providerId : null);
			}
			return result;
		},

		async deactivateProduct(productId) {
			await deactivateProductTree(productId);
		},

		async archiveDeleted(ref) {
			const provider = (await container.provider()).catalog;
			const archive = (entityKey: string, kind: "product" | "price") =>
				archiveDeletedEntity(provider, catalogLinks, clock, entityKey, kind);
			if (ref.entity === "price") {
				await archive(priceEntityKey(ref.id), "price");
				return;
			}
			if (ref.entity === "variant") {
				await archive(variantEntityKey(ref.id), "product");
				return;
			}
			// Variants and prices are separate entries: whatever still references the deleted product is archived too.
			await archive(productEntityKey(ref.id), "product");
			// Once the product is trashed its variants and prices are unreadable (their links to it are not): in a real
			// host these lists fail, and `prepareDelete` + cron settle each of them by link instead.
			for (const variant of await catalog.listVariants(ref.id).catch(() => [])) await archive(variantEntityKey(variant.id), "product");
			for (const price of await catalog.listPrices(ref.id).catch(() => [])) await archive(priceEntityKey(price.id), "price");
		},

		async prepareDelete(ref) {
			for (const dependent of await dependentsOf(ref)) {
				const key = entityKeyOf(dependent);
				// Only what already has a link: an entity that never reached Stripe gets none made up.
				if (await catalogLinks.get(key)) await markPending(catalogLinks, key);
			}
		},

		async handleProviderProductChanged(snapshot) {
			if (!snapshot.entityKey) return;
			const link = await linkOfSnapshot(snapshot.providerId, snapshot.entityKey);
			const fields = link ? driftFieldsForProduct(link, snapshot) : null;
			if (!link || !fields) return;
			await recordDrift(catalogLinks, clock, link, fields, (events) => publisher.publish(events));
		},

		async handleProviderPriceChanged(snapshot) {
			if (!snapshot.entityKey) return;
			const parsed = parseEntityKey(snapshot.entityKey);
			if (!parsed || parsed.entity !== "price") return;
			const link = await linkOfSnapshot(snapshot.providerId, snapshot.entityKey);
			const fields = link ? driftFieldsForPrice(link, snapshot) : null;
			if (!link || !fields) return;
			await recordDrift(catalogLinks, clock, link, fields, (events) => publisher.publish(events));
		},

		async processDue(limit) {
			const due = await catalogLinks.listDue(clock.now().toISOString(), limit);
			let processed = 0;
			for (const row of due) {
				const parsed = parseEntityKey(row.entityKey);
				if (!parsed) continue;
				await runAttempt(row.entityKey, parsed);
				processed += 1;
			}
			return processed;
		},

		async resync(productId) {
			const refs: CatalogEntityRef[] = [];
			if (productId === null) {
				let cursor: string | null = null;
				do {
					const page = await catalog.listProducts(cursor, 100);
					for (const product of page.items) {
						refs.push(...(await dependentsOfProduct(catalog, product.id)));
					}
					cursor = page.cursor;
				} while (cursor);
			} else {
				refs.push(...(await dependentsOfProduct(catalog, productId)));
			}
			for (const ref of refs) {
				await markPending(catalogLinks, entityKeyOf(ref), { force: true });
			}
			return { queued: refs.length };
		},
	};
};

export const runCatalogCron = async (container: CommerceContainer, publisher: EventPublisher, limit: number): Promise<number> =>
	createCatalogSyncService(container, publisher).processDue(limit);
