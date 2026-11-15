/** Stable short digest for idempotency key suffixes (never random). */
export const shortHash = (payload: unknown): string => {
	const text = typeof payload === "string" ? payload : JSON.stringify(payload);
	let hash = 2166136261;
	for (let index = 0; index < text.length; index += 1) {
		hash ^= text.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
};

/**
 * Two differently seeded FNV-1a rounds (64 bits in total) for "has the desired state changed?" comparisons,
 * where a collision would silently skip a needed provider write. Still not cryptographic: it only has to
 * tell honest edits apart.
 */
export const strongHash = (payload: unknown): string => {
	const text = typeof payload === "string" ? payload : JSON.stringify(payload);
	return `${shortHash(text)}${shortHash(`${text.length}|${[...text].reverse().join("")}`)}`;
};

export const productCreateKey = (entityKey: string): string => `stripe-commerce:product:create:${entityKey}`;
export const priceCreateKey = (priceId: string, fingerprint: string): string =>
	`stripe-commerce:price:create:${priceId}:${shortHash(fingerprint)}`;

/**
 * Update, archive and reactivate keys carry the link's `syncVersion`: Stripe replays a key's cached response
 * for 24 h, so an identical payload sent for a later intent (archive, reactivate, archive again) must not
 * reuse an earlier key. A retry of the same attempt keeps its version and therefore its key.
 */
export const productUpdateKey = (entityKey: string, syncVersion: number, payload: unknown): string =>
	`stripe-commerce:product:update:${entityKey}:v${syncVersion}:${shortHash(payload)}`;
export const priceUpdateKey = (providerPriceId: string, syncVersion: number, patch: unknown): string =>
	`stripe-commerce:price:update:${providerPriceId}:v${syncVersion}:${shortHash(patch)}`;
