import type { StorageCollection } from "emdash";

import { outboxState } from "../../../ports/due.js";
import type { Clock, EventOutbox, OutboxRecord } from "../../../ports/repositories.js";

export type OutboxDoc = OutboxRecord & { dueAt: string | null; deadCount: number };

const toRecord = ({ dueAt: _due, deadCount: _dead, ...record }: OutboxDoc): OutboxRecord => record;
const toDoc = (record: OutboxRecord): OutboxDoc => ({ ...record, ...outboxState(record) });

/** Domain events queued with per-subscriber delivery state; enqueue is idempotent on the event id. */
export const createEventOutbox = (collection: StorageCollection<OutboxDoc>, clock: Clock): EventOutbox => ({
	async enqueue(events, subscriberIds) {
		for (const event of events) {
			const record: OutboxRecord = {
				event,
				deliveries: Object.fromEntries(
					subscriberIds.map((id) => [id, { status: "pending" as const, attempts: 0, lastError: null, nextAttemptAt: null }]),
				),
				createdAt: clock.now().toISOString(),
			};
			// An existing event (a replayed webhook emits the same id) is left untouched.
			await collection.compareAndSet(event.id, null, toDoc(record));
		}
	},
	async get(eventId) {
		const found = await collection.getVersioned(eventId);
		return found ? { value: toRecord(found.value), revision: found.revision } : null;
	},
	update: (record, expectedRevision) => collection.compareAndSet(record.event.id, expectedRevision, toDoc(record)),
	async listDue(now, limit) {
		const page = await collection.query({ where: { dueAt: { lte: now } }, orderBy: { dueAt: "asc" }, limit });
		return page.items.map((item) => toRecord(item.data));
	},
	async purgeDelivered(before, limit) {
		// An event with any undelivered or dead delivery keeps `dueAt` set or `deadCount` above zero; the
		// per-delivery check below is the authority, the query only narrows the scan to old events.
		const page = await collection.query({ where: { deadCount: 0, createdAt: { lt: before } }, orderBy: { createdAt: "asc" }, limit });
		const ids = page.items.filter((item) => Object.values(item.data.deliveries).every((delivery) => delivery.status === "delivered")).map((item) => item.id);
		return collection.deleteMany(ids);
	},
	async listDead(limit) {
		const page = await collection.query({ where: { deadCount: { gte: 1 } }, orderBy: { createdAt: "asc" }, limit });
		return page.items.map((item) => toRecord(item.data));
	},
});
