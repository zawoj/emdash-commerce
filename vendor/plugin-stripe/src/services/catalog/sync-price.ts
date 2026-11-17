import { priceTermsFingerprint, type Price, type Product, type Variant } from "../../core/catalog.js";
import type { CatalogProvider, ProviderPriceInput } from "../../ports/payment-provider.js";
import type { CatalogLink, CatalogLinkStore, Clock } from "../../ports/repositories.js";
import type { CatalogMirror } from "../../adapters/emdash/content/catalog-mirror.js";
import { isPriceProviderActive } from "./active.js";
import { priceCreateKey, priceUpdateKey, strongHash } from "./idempotency.js";
import { beginWrite, loadLink, markSynced } from "./link-mutate.js";
import { productEntityKey, priceEntityKey, variantEntityKey } from "./entity-keys.js";

const parentProductLink = async (store: CatalogLinkStore, price: Price): Promise<string | null> => {
	const parentKey = price.variantId ? variantEntityKey(price.variantId) : productEntityKey(price.productId);
	const parent = await store.get(parentKey);
	return parent?.value.providerId ?? null;
};

const buildPriceInput = (entityKey: string, providerProductId: string, price: Price): ProviderPriceInput => ({
	entityKey,
	providerProductId,
	unitAmount: price.unitAmount,
	currency: price.currency,
	recurring: price.recurring ? { interval: price.recurring.interval, intervalCount: price.recurring.intervalCount } : null,
	taxBehavior: price.taxBehavior,
	nickname: price.nickname,
	lookupKey: price.lookupKey,
});

/** Hash of everything the plugin writes to a live price: its terms and the mutable fields. */
const liveHash = (fingerprint: string, price: Price, isActive: boolean): string =>
	strongHash({ fingerprint, isActive, nickname: price.nickname, lookupKey: price.lookupKey });

/** An archived price only has to stay archived; edits to its nickname are applied when it is reactivated. */
const archivedHash = (fingerprint: string | null): string => strongHash({ fingerprint, isActive: false });

const writtenOf = (price: Price, isActive: boolean) => ({ isActive, unitAmount: price.unitAmount, currency: price.currency as string });

const writeMirror = async (mirror: CatalogMirror, priceId: string, providerPriceId: string): Promise<void> => {
	await mirror.writePriceSync(priceId, { stripePriceId: providerPriceId, stripeSyncStatus: "synced", stripeSyncError: null });
};

const isUnchanged = (link: CatalogLink, hash: string): boolean => link.providerId !== null && link.lastWrittenHash === hash && link.driftFields.length === 0;

export const syncPriceEntity = async (
	catalog: CatalogProvider,
	store: CatalogLinkStore,
	clock: Clock,
	product: Product,
	variant: Variant | null,
	price: Price,
	mirror: CatalogMirror,
): Promise<void> => {
	const entityKey = priceEntityKey(price.id);
	const providerProductId = await parentProductLink(store, price);
	if (!providerProductId) {
		throw new Error(`Parent Stripe product is not synced for price ${price.id}`);
	}
	const fingerprint = priceTermsFingerprint(price);
	const isActive = isPriceProviderActive(product, variant, price);
	const desiredHash = liveHash(fingerprint, price, isActive);
	const { link } = await loadLink(store, entityKey);
	const sameTerms = link.fingerprint === fingerprint;
	let providerPriceId = sameTerms ? link.providerId : link.providerPriceByFingerprint[fingerprint] ?? null;

	if (sameTerms && providerPriceId && isUnchanged(link, desiredHash)) {
		if (link.syncStatus === "synced") return;
		await markSynced(store, clock, entityKey, { providerId: providerPriceId, fingerprint, lastWrittenHash: desiredHash, lastWritten: writtenOf(price, isActive) });
		await writeMirror(mirror, price.id, providerPriceId);
		return;
	}

	const version = await beginWrite(store, entityKey, desiredHash);

	if (sameTerms && providerPriceId) {
		const patch = { isActive, nickname: price.nickname, lookupKey: price.lookupKey };
		await catalog.updatePrice(providerPriceId, patch, priceUpdateKey(providerPriceId, version, patch));
		await markSynced(store, clock, entityKey, { providerId: providerPriceId, fingerprint, lastWrittenHash: desiredHash, lastWritten: writtenOf(price, isActive) });
		await writeMirror(mirror, price.id, providerPriceId);
		return;
	}

	if (!providerPriceId) {
		const created = await catalog.createPrice(buildPriceInput(entityKey, providerProductId, price), priceCreateKey(price.id, fingerprint));
		providerPriceId = created.providerId;
	} else {
		const patch = { isActive: true, nickname: price.nickname, lookupKey: price.lookupKey };
		await catalog.updatePrice(providerPriceId, patch, priceUpdateKey(providerPriceId, version, patch));
	}

	// The previous price stays reusable: its terms map back to it, so a revert does not create a third object.
	const map = { ...link.providerPriceByFingerprint, [fingerprint]: providerPriceId };
	const previousActiveId = link.providerId;
	if (previousActiveId && previousActiveId !== providerPriceId) {
		const archivePatch = { isActive: false, transferLookupKey: false as const };
		await catalog.updatePrice(previousActiveId, archivePatch, priceUpdateKey(previousActiveId, version, archivePatch));
		if (link.fingerprint) map[link.fingerprint] = previousActiveId;
	}
	await markSynced(store, clock, entityKey, {
		providerId: providerPriceId,
		fingerprint,
		providerPriceByFingerprint: map,
		lastWrittenHash: desiredHash,
		lastWritten: writtenOf(price, isActive),
	});
	await writeMirror(mirror, price.id, providerPriceId);
};

export const archivePriceEntity = async (
	catalog: CatalogProvider,
	store: CatalogLinkStore,
	clock: Clock,
	price: Price,
	mirror: CatalogMirror,
): Promise<void> => {
	const entityKey = priceEntityKey(price.id);
	const { link } = await loadLink(store, entityKey);
	if (!link.providerId) return;
	const desiredHash = archivedHash(link.fingerprint);
	const patch = { isActive: false };
	const synced = { providerId: link.providerId, fingerprint: link.fingerprint, lastWrittenHash: desiredHash, lastWritten: { unitAmount: price.unitAmount, currency: price.currency as string, ...link.lastWritten, isActive: false } };
	if (isUnchanged(link, desiredHash)) {
		if (link.syncStatus === "synced") return;
		await markSynced(store, clock, entityKey, synced);
		await writeMirror(mirror, price.id, link.providerId);
		return;
	}
	const version = await beginWrite(store, entityKey, desiredHash);
	await catalog.updatePrice(link.providerId, patch, priceUpdateKey(link.providerId, version, patch));
	await markSynced(store, clock, entityKey, synced);
	await writeMirror(mirror, price.id, link.providerId);
};
