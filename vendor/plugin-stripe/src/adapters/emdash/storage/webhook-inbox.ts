import type { KVAccess, StorageCollection } from "emdash";

import { EPOCH_ISO, inboxDueAt, truncateError } from "../../../ports/due.js";
import type { ProviderWebhookEvent } from "../../../ports/payment-provider.js";
import type { Clock, InboxRecord, InboxStatus, WebhookInbox } from "../../../ports/repositories.js";
import { KV_KEY } from "../constants.js";
import { updateWithCas, withSerializationRetry } from "./cas.js";

export interface InboxDoc extends InboxRecord {
	leaseUntil: string | null;
	dueAt: string | null;
}

const toRecord = ({ leaseUntil: _lease, dueAt: _due, ...record }: InboxDoc): InboxRecord => record;

const withDue = (doc: Omit<InboxDoc, "dueAt">): InboxDoc => ({ ...doc, dueAt: inboxDueAt(doc, doc.leaseUntil) });

/**
 * Durable record of verified provider events: unique by event id (the document id), processed under a
 * time-boxed lease so two workers never run one event, with retry state for the cron sweep. Every
 * transition is a revision compare-and-set on the single document.
 */
export const createWebhookInbox = (collection: StorageCollection<InboxDoc>, kv: KVAccess, clock: Clock): WebhookInbox => {
	const now = (): string => clock.now().toISOString();

	const record: WebhookInbox["record"] = async (event: ProviderWebhookEvent, payload, source) => {
			const doc = withDue({
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
			});
			const created = await collection.compareAndSet(event.eventId, null, doc);
			if (created.applied) return { isNew: true, record: toRecord(doc) };
			const existing = await collection.get(event.eventId);
			if (!existing) return record(event, payload, source);
			return { isNew: false, record: toRecord(existing) };
	};

	return {
		record,
		async claim(eventId, leaseMs) {
			const current = await collection.getVersioned(eventId);
			if (!current) return false;
			const { status, leaseUntil } = current.value;
			if (status === "processed" || status === "ignored" || status === "dead") return false;
			if (status === "processing" && leaseUntil !== null && leaseUntil > now()) return false;
			const next = withDue({
				...current.value,
				status: "processing",
				attempts: current.value.attempts + 1,
				leaseUntil: new Date(clock.now().getTime() + leaseMs).toISOString(),
			});
			// A lost race means another worker holds the lease now: do not retry.
			return (await collection.compareAndSet(eventId, current.revision, next)).applied;
		},
		async markProcessed(eventId) {
			await updateWithCas(collection, eventId, (doc) =>
				withDue({ ...doc, status: "processed", processedAt: now(), lastError: null, nextAttemptAt: null, leaseUntil: null }),
			);
		},
		async markIgnored(eventId, reason) {
			await updateWithCas(collection, eventId, (doc) =>
				withDue({ ...doc, status: "ignored", lastError: truncateError(reason), nextAttemptAt: null, leaseUntil: null }),
			);
		},
		async markFailed(eventId, error, nextAttemptAt) {
			const updated = await updateWithCas(collection, eventId, (doc) =>
				withDue({
					...doc,
					status: nextAttemptAt === null ? "dead" : "failed",
					lastError: truncateError(error),
					nextAttemptAt,
					leaseUntil: null,
				}),
			);
			if (!updated) throw new Error(`Unknown inbox event ${eventId}`);
			return toRecord(updated);
		},
		async requeue(eventId) {
			let isRequeued = false;
			await updateWithCas(collection, eventId, (doc) => {
				isRequeued = false;
				if (doc.status === "processing" && doc.leaseUntil !== null && doc.leaseUntil > now()) return null;
				isRequeued = true;
				return withDue({ ...doc, status: "received", attempts: 0, lastError: null, nextAttemptAt: EPOCH_ISO, processedAt: null, leaseUntil: null });
			});
			return isRequeued;
		},
		async get(eventId) {
			const doc = await collection.get(eventId);
			return doc ? toRecord(doc) : null;
		},
		async listDue(at, limit) {
			const page = await collection.query({ where: { dueAt: { lte: at } }, orderBy: { dueAt: "asc" }, limit });
			return page.items.map((item) => toRecord(item.data));
		},
		async listByStatus(status: InboxStatus, limit, cursor) {
			const page = await collection.query({ where: { status }, orderBy: { receivedAt: "desc" }, limit, cursor: cursor ?? undefined });
			return { items: page.items.map((item) => toRecord(item.data)), cursor: page.hasMore ? (page.cursor ?? null) : null };
		},
		async purgeFinished(before, limit) {
			const page = await collection.query({ where: { status: { in: ["processed", "ignored"] }, receivedAt: { lt: before } }, orderBy: { receivedAt: "asc" }, limit });
			return collection.deleteMany(page.items.map((item) => item.id));
		},
		async getCursor() {
			return kv.get<number>(KV_KEY.webhookCursor);
		},
		async setCursor(created) {
			// Monotonic: only ever moves forward, so a late or replayed event cannot rewind reconciliation.
			for (;;) {
				const current = await withSerializationRetry(() => kv.getVersioned<number>(KV_KEY.webhookCursor));
				if (current && current.value >= created) return;
				const written = await kv.compareAndSet(KV_KEY.webhookCursor, current?.revision ?? null, created);
				if (written.applied) return;
			}
		},
	};
};
