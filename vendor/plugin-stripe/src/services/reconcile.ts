import { WEBHOOK_EVENT_TYPES } from "../adapters/stripe/webhook-events.js";
import type { CommerceContainer } from "../plugin/container.js";
import { INBOX_OUTCOME, processInboxEvent, serializeEvent } from "./webhook-inbox.js";

/**
 * Reconciliation closes gaps webhooks leave (endpoint down, deliveries exhausted): it lists the provider's
 * recent events, records the ones the inbox never saw and runs them through the same pipeline. Events the
 * inbox already has are skipped without touching them, so running it twice (or alongside webhook delivery)
 * changes nothing. The cursor only moves forward, and each run is bounded so a long outage is caught up
 * over several runs.
 */

/** Re-list this far behind the cursor: events of one second may reach the inbox in any order. */
export const RECONCILE_OVERLAP_SECONDS = 300;
/** With no cursor yet (first run), look back this far. */
export const RECONCILE_DEFAULT_LOOKBACK_SECONDS = 60 * 60;
export const RECONCILE_MAX_NEW_EVENTS = 100;
export const RECONCILE_MAX_SCANNED_EVENTS = 1000;

export interface ReconcileResult {
	/** The `created` the provider was asked to list after. */
	since: number;
	scanned: number;
	recorded: number;
	processed: number;
	ignored: number;
	failed: number;
	/** True when a bound stopped the run; run it again to continue. */
	isTruncated: boolean;
}

export const reconcile = async (container: CommerceContainer, input: { since?: number } = {}): Promise<ReconcileResult> => {
	const provider = await container.provider();
	const cursor = await container.inbox.getCursor();
	const nowSeconds = Math.floor(container.clock.now().getTime() / 1000);
	const since = input.since ?? (cursor !== null ? cursor - RECONCILE_OVERLAP_SECONDS : nowSeconds - RECONCILE_DEFAULT_LOOKBACK_SECONDS);
	const result: ReconcileResult = { since, scanned: 0, recorded: 0, processed: 0, ignored: 0, failed: 0, isTruncated: false };

	for await (const event of provider.webhooks.listEventsSince(since, WEBHOOK_EVENT_TYPES)) {
		if (result.recorded >= RECONCILE_MAX_NEW_EVENTS || result.scanned >= RECONCILE_MAX_SCANNED_EVENTS) {
			result.isTruncated = true;
			break;
		}
		result.scanned += 1;
		const { isNew } = await container.inbox.record(event, serializeEvent(event), "reconcile");
		if (isNew) {
			result.recorded += 1;
			const outcome = await processInboxEvent(container, event.eventId, "reconcile");
			if (outcome.outcome === INBOX_OUTCOME.processed) result.processed += 1;
			else if (outcome.outcome === INBOX_OUTCOME.ignored) result.ignored += 1;
			else result.failed += 1;
		}
		// Oldest first, so advancing per event never skips one still to come; failures are kept in the inbox.
		await container.inbox.setCursor(event.created);
	}
	return result;
};
