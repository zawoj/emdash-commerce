import type { Cart } from "../../core/cart.js";
import { catalogLinkDueAt, EPOCH_ISO, inboxDueAt, outboxState, truncateError } from "../../ports/due.js";
import type {
	CartStore,
	CasResult,
	CatalogLink,
	CatalogLinkStore,
	CheckoutSnapshot,
	CheckoutSnapshotStore,
	Clock,
	EventOutbox,
	InboxRecord,
	InboxStatus,
	OutboxRecord,
	RateLimiter,
	RefundStore,
	Versioned,
	WebhookInbox,
} from "../../ports/repositories.js";
import type { ProviderWebhookEvent } from "../../ports/payment-provider.js";
import type { Refund as RefundRecord } from "../../core/payment.js";
import { clone, tick, toCursorPage, VersionedMap } from "./runtime.js";

export const createInMemoryCatalogLinkStore = (): CatalogLinkStore => {
	const rows = new VersionedMap<CatalogLink>();
	const all = (): CatalogLink[] => rows.all().map((row) => row.value);
	return {
		get: (entityKey) => rows.get(entityKey),
		put: (link, expectedRevision) => rows.put(link.entityKey, link, expectedRevision),
		async findByProviderId(providerId) {
			await tick();
			return all().find((link) => link.providerId === providerId) ?? null;
		},
		async listDue(now, limit) {
			await tick();
			return all()
				.filter((link) => {
					const due = catalogLinkDueAt(link);
					return due !== null && due <= now;
				})
				.sort((a, b) => (catalogLinkDueAt(a) ?? EPOCH_ISO).localeCompare(catalogLinkDueAt(b) ?? EPOCH_ISO))
				.slice(0, limit);
		},
		async listFailed(limit) {
			await tick();
			return all().filter((link) => link.syncStatus === "failed").slice(0, limit);
		},
	};
};

export const createInMemoryCartStore = (): CartStore => {
	const rows = new VersionedMap<Cart>();
	const carts = (): Cart[] => rows.all().map((row) => row.value);
	return {
		get: (cartId) => rows.get(cartId),
		put: (cart, expectedRevision) => rows.put(cart.id, cart, expectedRevision),
		async delete(cartId) {
			await rows.delete(cartId);
		},
		async listExpiringBefore(isoTime, limit) {
			await tick();
			return carts()
				.filter((cart) => ["active", "checkout_open", "abandoned"].includes(cart.status) && cart.expiresAt < isoTime)
				.sort((a, b) => a.expiresAt.localeCompare(b.expiresAt))
				.slice(0, limit);
		},
		async listByStatus(status, updatedBefore, limit) {
			await tick();
			return carts()
				.filter((cart) => cart.status === status && cart.updatedAt < updatedBefore)
				.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
				.slice(0, limit);
		},
	};
};

export const createInMemoryCheckoutSnapshotStore = (): CheckoutSnapshotStore => {
	const rows = new VersionedMap<CheckoutSnapshot>();
	return {
		async get(checkoutId) {
			return (await rows.get(checkoutId))?.value ?? null;
		},
		async getBySession(sessionId) {
			await tick();
			return rows.all().find((row) => row.value.sessionId === sessionId)?.value ?? null;
		},
		async put(snapshot) {
			await rows.set(snapshot.checkoutId, snapshot);
		},
		async listCreatedBefore(before, limit, after) {
			await tick();
			return rows
				.all()
				.map((row) => row.value)
				.filter((snapshot) => snapshot.createdAt < before && (!after || snapshot.createdAt > after))
				.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
				.slice(0, limit);
		},
		async delete(checkoutId) {
			await rows.delete(checkoutId);
		},
	};
};

export const createInMemoryRefundStore = (): RefundStore => {
	const rows = new VersionedMap<RefundRecord>();
	return {
		async get(id) {
			return (await rows.get(id))?.value ?? null;
		},
		async put(refund: RefundRecord) {
			await rows.set(refund.id, refund);
		},
		async listByOrder(orderId) {
			await tick();
			return rows
				.all()
				.map((row) => row.value)
				.filter((refund) => refund.orderId === orderId)
				.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
		},
	};
};

interface StoredInbox extends InboxRecord {
	leaseUntil: string | null;
}

const publicInbox = ({ leaseUntil: _lease, ...record }: StoredInbox): InboxRecord => record;

export const createInMemoryWebhookInbox = (clock: Clock): WebhookInbox => {
	const rows = new VersionedMap<StoredInbox>();
	let cursor: number | null = null;
	const now = (): string => clock.now().toISOString();

	/** Read-modify-write on one record with CAS retry. */
	const mutate = async (eventId: string, change: (record: StoredInbox) => StoredInbox | null): Promise<StoredInbox | null> => {
		for (;;) {
			const current = await rows.get(eventId);
			if (!current) return null;
			const next = change(clone(current.value));
			if (!next) return current.value;
			if ((await rows.put(eventId, next, current.revision)).applied) return next;
		}
	};

	return {
		async record(event: ProviderWebhookEvent, payload, source) {
			const record: StoredInbox = {
				eventId: event.eventId,
				type: event.type,
				created: event.created,
				isLivemode: event.isLivemode,
				status: "received",
				attempts: 0,
				lastError: null,
				nextAttemptAt: null,
				receivedAt: now(),
				processedAt: null,
				payload,
				source,
				leaseUntil: null,
			};
			if ((await rows.put(event.eventId, record, null)).applied) return { isNew: true, record: publicInbox(record) };
			const existing = await rows.get(event.eventId);
			return { isNew: false, record: publicInbox(existing!.value) };
		},
		async claim(eventId, leaseMs) {
			const current = await rows.get(eventId);
			if (!current) return false;
			const { status, leaseUntil } = current.value;
			if (status === "processed" || status === "ignored" || status === "dead") return false;
			if (status === "processing" && leaseUntil !== null && leaseUntil > now()) return false;
			const next: StoredInbox = {
				...current.value,
				status: "processing",
				attempts: current.value.attempts + 1,
				leaseUntil: new Date(clock.now().getTime() + leaseMs).toISOString(),
			};
			return (await rows.put(eventId, next, current.revision)).applied;
		},
		async markProcessed(eventId) {
			await mutate(eventId, (record) => ({ ...record, status: "processed", processedAt: now(), lastError: null, nextAttemptAt: null, leaseUntil: null }));
		},
		async markIgnored(eventId, reason) {
			await mutate(eventId, (record) => ({ ...record, status: "ignored", lastError: truncateError(reason), nextAttemptAt: null, leaseUntil: null }));
		},
		async markFailed(eventId, error, nextAttemptAt) {
			const updated = await mutate(eventId, (record) => ({
				...record,
				status: nextAttemptAt === null ? "dead" : "failed",
				lastError: truncateError(error),
				nextAttemptAt,
				leaseUntil: null,
			}));
			if (!updated) throw new Error(`Unknown inbox event ${eventId}`);
			return publicInbox(updated);
		},
		async requeue(eventId) {
			let isRequeued = false;
			await mutate(eventId, (record) => {
				if (record.status === "processing" && record.leaseUntil !== null && record.leaseUntil > now()) return null;
				isRequeued = true;
				return { ...record, status: "received", attempts: 0, lastError: null, nextAttemptAt: EPOCH_ISO, processedAt: null, leaseUntil: null };
			});
			return isRequeued;
		},
		async get(eventId) {
			const row = await rows.get(eventId);
			return row ? publicInbox(row.value) : null;
		},
		async listDue(at, limit) {
			await tick();
			return rows
				.all()
				.map((row) => row.value)
				.filter((record) => {
					const due = inboxDueAt(record, record.leaseUntil);
					return due !== null && due <= at;
				})
				.sort((a, b) => (inboxDueAt(a, a.leaseUntil) ?? "").localeCompare(inboxDueAt(b, b.leaseUntil) ?? "") || a.eventId.localeCompare(b.eventId))
				.slice(0, limit)
				.map(publicInbox);
		},
		async listByStatus(status: InboxStatus, limit, pageCursor) {
			await tick();
			const matches = rows
				.all()
				.map((row) => row.value)
				.filter((record) => record.status === status)
				.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt) || b.eventId.localeCompare(a.eventId))
				.map(publicInbox);
			return toCursorPage(matches, pageCursor, limit);
		},
		async purgeFinished(before, limit) {
			await tick();
			const doomed = rows
				.all()
				.map((row) => row.value)
				.filter((record) => (record.status === "processed" || record.status === "ignored") && record.receivedAt < before)
				.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))
				.slice(0, limit);
			for (const record of doomed) await rows.delete(record.eventId);
			return doomed.length;
		},
		async getCursor() {
			await tick();
			return cursor;
		},
		async setCursor(created) {
			await tick();
			if (cursor === null || created > cursor) cursor = created;
		},
	};
};

export const createInMemoryEventOutbox = (clock: Clock): EventOutbox => {
	const rows = new VersionedMap<OutboxRecord>();
	return {
		async enqueue(events, subscriberIds) {
			for (const event of events) {
				const record: OutboxRecord = {
					event: clone(event),
					deliveries: Object.fromEntries(
						subscriberIds.map((id) => [id, { status: "pending" as const, attempts: 0, lastError: null, nextAttemptAt: null }]),
					),
					createdAt: clock.now().toISOString(),
				};
				await rows.put(event.id, record, null);
			}
		},
		get: (eventId): Promise<Versioned<OutboxRecord> | null> => rows.get(eventId),
		update: (record, expectedRevision): Promise<CasResult> => rows.put(record.event.id, record, expectedRevision),
		async listDue(now, limit) {
			await tick();
			return rows
				.all()
				.map((row) => row.value)
				.filter((record) => {
					const { dueAt } = outboxState(record);
					return dueAt !== null && dueAt <= now;
				})
				.sort((a, b) => (outboxState(a).dueAt ?? "").localeCompare(outboxState(b).dueAt ?? "") || a.event.id.localeCompare(b.event.id))
				.slice(0, limit);
		},
		async purgeDelivered(before, limit) {
			await tick();
			const doomed = rows
				.all()
				.map((row) => row.value)
				.filter((record) => record.createdAt < before && Object.values(record.deliveries).every((delivery) => delivery.status === "delivered"))
				.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
				.slice(0, limit);
			for (const record of doomed) await rows.delete(record.event.id);
			return doomed.length;
		},
		async listDead(limit) {
			await tick();
			return rows
				.all()
				.map((row) => row.value)
				.filter((record) => outboxState(record).deadCount > 0)
				.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.event.id.localeCompare(b.event.id))
				.slice(0, limit);
		},
	};
};

export const createInMemoryRateLimiter = (clock: Clock): RateLimiter => {
	const windows = new Map<string, number>();
	/** Window end per counter id, so a purge can tell finished windows from the current one. */
	const endsAt = new Map<string, number>();
	return {
		async purgeExpired(limit) {
			await tick();
			const nowMs = clock.now().getTime();
			const doomed = [...endsAt].filter(([, end]) => end < nowMs).slice(0, limit);
			for (const [id] of doomed) {
				windows.delete(id);
				endsAt.delete(id);
			}
			return doomed.length;
		},
		async hit(key, limit, windowMs) {
			await tick();
			const window = Math.floor(clock.now().getTime() / windowMs);
			const id = `${key}:${window}`;
			const count = windows.get(id) ?? 0;
			if (count >= limit) return false;
			windows.set(id, count + 1);
			endsAt.set(id, (window + 1) * windowMs);
			return true;
		},
	};
};
