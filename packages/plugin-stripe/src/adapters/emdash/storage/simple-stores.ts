import type { StorageCollection } from "emdash";

import type { Cart } from "../../../core/cart.js";
import type { Refund } from "../../../core/payment.js";
import { catalogLinkDueAt } from "../../../ports/due.js";
import type {
	CartStore,
	CatalogLink,
	CatalogLinkStore,
	CheckoutSnapshot,
	CheckoutSnapshotStore,
	Clock,
	RateLimiter,
	RefundStore,
} from "../../../ports/repositories.js";
import { queryAll, withSerializationRetry } from "./cas.js";

export type CatalogLinkDoc = CatalogLink & { dueAt: string | null };

const stripDue = ({ dueAt: _dueAt, ...link }: CatalogLinkDoc): CatalogLink => link;

export const createCatalogLinkStore = (collection: StorageCollection<CatalogLinkDoc>): CatalogLinkStore => ({
	async get(entityKey) {
		const found = await collection.getVersioned(entityKey);
		return found ? { value: stripDue(found.value), revision: found.revision } : null;
	},
	put: (link, expectedRevision) => collection.compareAndSet(link.entityKey, expectedRevision, { ...link, dueAt: catalogLinkDueAt(link) }),
	async findByProviderId(providerId) {
		const page = await collection.query({ where: { providerId }, limit: 1 });
		const first = page.items[0];
		return first ? stripDue(first.data) : null;
	},
	async listDue(now, limit) {
		const page = await collection.query({ where: { dueAt: { lte: now } }, orderBy: { dueAt: "asc" }, limit });
		return page.items.map((item) => stripDue(item.data));
	},
	async listFailed(limit) {
		const page = await collection.query({ where: { syncStatus: "failed" }, orderBy: { dueAt: "asc" }, limit });
		return page.items.map((item) => stripDue(item.data));
	},
});

export const createCartStore = (collection: StorageCollection<Cart>): CartStore => {
	const toResult = (items: Array<{ data: Cart }>): Cart[] => items.map((item) => item.data);
	return {
		get: (cartId) => collection.getVersioned(cartId),
		put: (cart, expectedRevision) => collection.compareAndSet(cart.id, expectedRevision, cart),
		async delete(cartId) {
			await collection.delete(cartId);
		},
		async listExpiringBefore(isoTime, limit) {
			// Carts that already reached a final status (converted, expired) are not swept again.
			const page = await collection.query({
				where: { status: { in: ["active", "checkout_open", "abandoned"] }, expiresAt: { lt: isoTime } },
				orderBy: { expiresAt: "asc" },
				limit,
			});
			return toResult(page.items);
		},
		async listByStatus(status, updatedBefore, limit) {
			const page = await collection.query({ where: { status, updatedAt: { lt: updatedBefore } }, orderBy: { updatedAt: "asc" }, limit });
			return toResult(page.items);
		},
	};
};

export const createCheckoutSnapshotStore = (collection: StorageCollection<CheckoutSnapshot>): CheckoutSnapshotStore => ({
	get: (checkoutId) => collection.get(checkoutId),
	async getBySession(sessionId) {
		const page = await collection.query({ where: { sessionId }, limit: 1 });
		return page.items[0]?.data ?? null;
	},
	async put(snapshot) {
		await collection.put(snapshot.checkoutId, snapshot);
	},
});

export const createRefundStore = (collection: StorageCollection<Refund>): RefundStore => ({
	get: (id) => collection.get(id),
	async put(refund) {
		await collection.put(refund.id, refund);
	},
	async listByOrder(orderId) {
		const refunds = await queryAll(collection, { where: { orderId }, orderBy: { createdAt: "asc" } });
		return refunds;
	},
});

export interface RateLimitDoc {
	count: number;
	expiresAt: string;
}

/**
 * Fixed-window counter: one document per key and window. A hit is a guarded increment (`count < limit`), so
 * a flood of rejected requests does not keep writing; the first hit of a window creates the document.
 */
export const createRateLimiter = (
	collection: StorageCollection<RateLimitDoc>,
	clock: Clock,
): RateLimiter & { purgeExpired(limit: number): Promise<number> } => ({
	async hit(key, limit, windowMs) {
		const nowMs = clock.now().getTime();
		const window = Math.floor(nowMs / windowMs);
		const id = `${key}:${window}`;
		for (;;) {
			const incremented = await withSerializationRetry(() =>
				collection.updateIf(id, { where: { count: { lt: limit } }, delta: { count: { inc: 1 } } }),
			);
			if (incremented.applied) return true;
			if (await collection.exists(id)) return false;
			const expiresAt = new Date((window + 1) * windowMs).toISOString();
			const created = await collection.compareAndSet(id, null, { count: 1, expiresAt });
			if (created.applied) return limit >= 1;
		}
	},
	async purgeExpired(limit) {
		const page = await collection.query({ where: { expiresAt: { lt: clock.now().toISOString() } }, limit });
		return collection.deleteMany(page.items.map((item) => item.id));
	},
});
