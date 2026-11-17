import { CommerceError } from "../core/errors.js";
import type { CommerceContainer } from "../plugin/container.js";
import type { ProviderWebhookEvent } from "../ports/payment-provider.js";
import type { InboxRecord } from "../ports/repositories.js";
import { createExtensionContext } from "./extension-context.js";
import { createEventPublisher } from "./outbox.js";
import { errorMessage, nextAttemptIso, withTimeout } from "./payments/async.js";
import { keyLivemode, type HandlerResult } from "./payments/deps.js";
import { dispatchAction } from "./payments/dispatch.js";

/** How long a worker owns an event; a crashed worker's event becomes due again after this. */
export const INBOX_LEASE_MS = 60_000;
/** A site's `stripeWebhooks` extension gets this long per call. */
export const EXTENSION_TIMEOUT_MS = 10_000;

export const INBOX_OUTCOME = {
	processed: "processed",
	ignored: "ignored",
	failed: "failed",
	dead: "dead",
	/** Already finished (processed, ignored or dead) before this call. */
	duplicate: "duplicate",
	/** Another worker holds the lease. */
	busy: "busy",
	missing: "missing",
} as const;
export type InboxOutcome = (typeof INBOX_OUTCOME)[keyof typeof INBOX_OUTCOME];

export interface InboxResult {
	outcome: InboxOutcome;
	error?: string;
	reason?: string;
}

/** What the inbox stores: the whole normalised event (action and raw provider event), so retries need no provider call. */
export const serializeEvent = (event: ProviderWebhookEvent): string => JSON.stringify(event);

const parseStoredEvent = (payload: string): ProviderWebhookEvent | null => {
	try {
		const event = JSON.parse(payload) as Partial<ProviderWebhookEvent>;
		const action = event.action as { kind?: unknown } | undefined;
		if (typeof event.eventId !== "string" || typeof event.type !== "string" || typeof action?.kind !== "string") return null;
		return event as ProviderWebhookEvent;
	} catch {
		return null;
	}
};

const runExtensions = async (container: CommerceContainer, event: ProviderWebhookEvent): Promise<void> => {
	const registry = container.extensions.stripeWebhooks;
	if (!registry) return;
	const ctx = createExtensionContext(container);
	for (const key of [event.type, "*"]) {
		const handler = registry[key];
		if (!handler) continue;
		await withTimeout(() => handler(event.raw, ctx), EXTENSION_TIMEOUT_MS, `stripeWebhooks["${key}"]`);
	}
};

/** Backs off until `webhooks.maxAttempts`, then parks the event as dead (replay is manual). */
const recordFailure = async (container: CommerceContainer, eventId: string, error: unknown, isFinal = false): Promise<InboxResult> => {
	const message = errorMessage(error);
	const record = await container.inbox.get(eventId);
	const attempts = record?.attempts ?? 1;
	const isDead = isFinal || attempts >= container.options.webhooks.maxAttempts;
	const updated = await container.inbox.markFailed(eventId, message, isDead ? null : nextAttemptIso(container.clock.now(), attempts));
	container.log.warn("Webhook event failed", { eventId, type: updated.type, attempts, status: updated.status, error: message });
	return { outcome: updated.status === "dead" ? INBOX_OUTCOME.dead : INBOX_OUTCOME.failed, error: message };
};

/**
 * The webhook pipeline for one stored event: take the lease, check the event belongs to this key's mode,
 * run the built-in handler for its normalised action, then the site's raw-event extensions, then mark it
 * done. Any failure is recorded with exponential backoff (cron retries it) until the attempt limit parks it
 * as dead. Handlers are idempotent, so running an event twice (a lost lease, a replay) is harmless.
 */
export const processInboxEvent = async (container: CommerceContainer, eventId: string, source: InboxRecord["source"] = "webhook"): Promise<InboxResult> => {
	const record = await container.inbox.get(eventId);
	if (!record) return { outcome: INBOX_OUTCOME.missing };
	if (record.status === "processed" || record.status === "ignored" || record.status === "dead") return { outcome: INBOX_OUTCOME.duplicate };
	if (!(await container.inbox.claim(eventId, INBOX_LEASE_MS))) return { outcome: INBOX_OUTCOME.busy };

	const event = parseStoredEvent(record.payload);
	if (!event) return recordFailure(container, eventId, new Error("Stored event payload is unreadable"), true);

	try {
		const mode = await keyLivemode(container);
		if (mode !== null && event.isLivemode !== mode) {
			const reason = `Event livemode (${event.isLivemode}) does not match the configured key (${mode})`;
			await container.inbox.markIgnored(eventId, reason);
			return { outcome: INBOX_OUTCOME.ignored, reason };
		}
		const result: HandlerResult = await dispatchAction({ container, publisher: createEventPublisher(container) }, event);
		await runExtensions(container, event);
		if (result.kind === "ignored") {
			await container.inbox.markIgnored(eventId, result.reason);
			return { outcome: INBOX_OUTCOME.ignored, reason: result.reason };
		}
		await container.inbox.markProcessed(eventId);
		container.log.debug("Webhook event processed", { eventId, type: event.type, source });
		return { outcome: INBOX_OUTCOME.processed };
	} catch (error) {
		return recordFailure(container, eventId, error);
	}
};

export interface DueSummary {
	attempted: number;
	processed: number;
	ignored: number;
	failed: number;
	dead: number;
}

/** Cron: runs events that are due (failed with their backoff elapsed, requeued, or abandoned by a dead worker). */
export const processDueInbox = async (container: CommerceContainer, limit: number): Promise<DueSummary> => {
	const due = await container.inbox.listDue(container.clock.now().toISOString(), limit);
	const summary: DueSummary = { attempted: 0, processed: 0, ignored: 0, failed: 0, dead: 0 };
	for (const record of due) {
		const result = await processInboxEvent(container, record.eventId, record.source);
		if (result.outcome === INBOX_OUTCOME.busy || result.outcome === INBOX_OUTCOME.duplicate || result.outcome === INBOX_OUTCOME.missing) continue;
		summary.attempted += 1;
		if (result.outcome === INBOX_OUTCOME.processed) summary.processed += 1;
		else if (result.outcome === INBOX_OUTCOME.ignored) summary.ignored += 1;
		else if (result.outcome === INBOX_OUTCOME.dead) summary.dead += 1;
		else summary.failed += 1;
	}
	return summary;
};

/** Admin: runs a stored event again from the start (attempts reset), whatever state it ended in. */
export const replayInboxEvent = async (container: CommerceContainer, eventId: string): Promise<InboxResult> => {
	if (!(await container.inbox.get(eventId))) throw new CommerceError("notFound", "No such webhook event");
	if (!(await container.inbox.requeue(eventId))) throw new CommerceError("conflict", "The event is being processed right now");
	return processInboxEvent(container, eventId, "replay");
};
