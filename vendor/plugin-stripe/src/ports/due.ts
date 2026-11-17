import type { CatalogLink, InboxRecord, OutboxRecord } from "./repositories.js";

/**
 * "When is this record next worth looking at?" rules shared by the in-memory and the EmDash storage
 * stores. Storage can only filter on a plain indexed field, and SQL comparisons with NULL never match,
 * so every due record carries an explicit ISO `dueAt` (and finished ones carry null).
 */

export const EPOCH_ISO = "1970-01-01T00:00:00.000Z";

/** A freshly received event is processed inline by the webhook route; cron only picks it up after this. */
export const INBOX_INLINE_GRACE_MS = 2 * 60 * 1000;

export const MAX_STORED_ERROR_LENGTH = 500;

export const truncateError = (message: string): string =>
	message.length > MAX_STORED_ERROR_LENGTH ? `${message.slice(0, MAX_STORED_ERROR_LENGTH)}…` : message;

export const catalogLinkDueAt = (link: Pick<CatalogLink, "syncStatus" | "nextAttemptAt">): string | null =>
	link.syncStatus === "synced" ? null : (link.nextAttemptAt ?? EPOCH_ISO);

export const inboxDueAt = (
	record: Pick<InboxRecord, "status" | "receivedAt" | "nextAttemptAt">,
	leaseUntil: string | null,
): string | null => {
	switch (record.status) {
		case "received":
			// A requeued event (replay) is due immediately; a fresh one waits for the inline attempt.
			return record.nextAttemptAt ?? new Date(new Date(record.receivedAt).getTime() + INBOX_INLINE_GRACE_MS).toISOString();
		case "processing":
			// An expired lease means the worker died: the event is due again.
			return leaseUntil;
		case "failed":
			return record.nextAttemptAt ?? EPOCH_ISO;
		default:
			return null;
	}
};

export const outboxState = (record: Pick<OutboxRecord, "deliveries">): { dueAt: string | null; deadCount: number } => {
	let dueAt: string | null = null;
	let deadCount = 0;
	for (const delivery of Object.values(record.deliveries)) {
		if (delivery.status === "dead") deadCount += 1;
		if (delivery.status !== "pending" && delivery.status !== "failed") continue;
		const due = delivery.nextAttemptAt ?? EPOCH_ISO;
		if (dueAt === null || due < dueAt) dueAt = due;
	}
	return { dueAt, deadCount };
};
