import type { CatalogProvider, ProviderProductInput } from "../../ports/payment-provider.js";
import type { CatalogLinkStore, Clock } from "../../ports/repositories.js";
import { productCreateKey, productUpdateKey, strongHash } from "./idempotency.js";
import { beginWrite, loadLink, markSynced } from "./link-mutate.js";

export interface ProductWriteResult {
	providerId: string;
	/** True when a provider call was made or the link was not yet `synced` (so a content mirror needs a refresh). */
	hasChanged: boolean;
}

/** Everything Stripe stores for a product; the hash of this is what "unchanged" means. */
const writtenHashOf = (input: ProviderProductInput): string =>
	strongHash({
		name: input.name,
		description: input.description,
		imageUrls: input.imageUrls,
		isActive: input.isActive,
		taxCode: input.taxCode,
	});

export interface ProductWriteMode {
	/** `upsert` creates (after adopting an existing object) when there is none; `archive-only` never creates. */
	kind: "upsert" | "archive-only";
}

/**
 * Brings the Stripe product of a product or variant to `input`. Adoption comes before creation, an
 * unchanged payload makes no call, and updates carry the link's sync version in the idempotency key.
 * Returns null when there is nothing to archive.
 */
export const writeProviderProduct = async (
	catalog: CatalogProvider,
	store: CatalogLinkStore,
	clock: Clock,
	entityKey: string,
	input: ProviderProductInput,
	mode: ProductWriteMode,
): Promise<ProductWriteResult | null> => {
	const { link } = await loadLink(store, entityKey);
	const desiredHash = writtenHashOf(input);
	const written = { name: input.name, isActive: input.isActive };
	let providerId = link.providerId;
	if (!providerId && mode.kind === "upsert") {
		const adopted = await catalog.findProductByEntity(entityKey);
		if (adopted) providerId = adopted.providerId;
	}
	if (!providerId) {
		if (mode.kind === "archive-only") return null;
		const created = await catalog.createProduct(input, productCreateKey(entityKey));
		await markSynced(store, clock, entityKey, { providerId: created.providerId, fingerprint: null, lastWrittenHash: desiredHash, lastWritten: written });
		return { providerId: created.providerId, hasChanged: true };
	}
	const isUnchanged = link.providerId === providerId && link.lastWrittenHash === desiredHash && link.driftFields.length === 0;
	if (isUnchanged) {
		const isSettled = link.syncStatus === "synced";
		if (!isSettled) await markSynced(store, clock, entityKey, { providerId, fingerprint: null, lastWrittenHash: desiredHash, lastWritten: written });
		return { providerId, hasChanged: !isSettled };
	}
	const version = await beginWrite(store, entityKey, desiredHash);
	await catalog.updateProduct(providerId, input, productUpdateKey(entityKey, version, input));
	await markSynced(store, clock, entityKey, { providerId, fingerprint: null, lastWrittenHash: desiredHash, lastWritten: written });
	return { providerId, hasChanged: true };
};
