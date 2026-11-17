import type { AnyCommerceEvent, CommerceEventPayloads, CommerceEventType } from "../../core/events.js";
import { commerceEventId } from "../../core/events.js";
import type { CommerceContainer } from "../../plugin/container.js";
import { PROVIDER_METADATA } from "../../ports/payment-provider.js";
import type { EventPublisher } from "../contracts.js";
import { sleep } from "./async.js";

/** What every money-path handler needs: the ports, and the publisher domain events go out through. */
export interface Deps {
	container: CommerceContainer;
	publisher: EventPublisher;
}

/** The outcome of a built-in handler; `ignored` events are kept in the inbox for audit with the reason. */
export type HandlerResult = { kind: "handled" } | { kind: "ignored"; reason: string };

export const HANDLED: HandlerResult = { kind: "handled" };
export const ignored = (reason: string): HandlerResult => ({ kind: "ignored", reason });

/**
 * Index keys of this package's own (the shared ones are `RECORD_INDEX_KEY`). Values are record ids or, where
 * noted, a small state string: `RecordIndex` is the plugin's atomic key-to-string store.
 */
export const INDEX_KEY = {
	/** An async payment failure was seen for this session; it can arrive before the order exists. */
	checkoutFailed: (sessionId: string): string => `checkout:failed:${sessionId}`,
	/** Customer aggregates were applied for this order (exactly once). */
	customerCounted: (orderId: string): string => `customer:counted:${orderId}`,
	/** The stock of a paid order whose reservation had already been released was decremented (exactly once). */
	stockAdjusted: (orderId: string): string => `order:stock-adjusted:${orderId}`,
	/** Last known state of a dispute: `open`, `won` or `lost` (a closed dispute never reopens). */
	disputeState: (disputeId: string): string => `dispute:state:${disputeId}`,
	/** Refund ids whose stock was put back (exactly once). */
	refundRestocked: (refundId: string): string => `refund:restocked:${refundId}`,
	/** Restock lines requested together with a refund, JSON. */
	refundRestockPlan: (refundId: string): string => `refund:restock-plan:${refundId}`,
	/** An invoice whose payment was already linked to the initial order. */
	invoiceHandled: (invoiceId: string): string => `invoice:handled:${invoiceId}`,
} as const;

export const makeEvent = <T extends CommerceEventType>(
	container: CommerceContainer,
	type: T,
	sourceId: string,
	data: CommerceEventPayloads[T],
): AnyCommerceEvent =>
	({
		id: commerceEventId(type, sourceId),
		type,
		occurredAt: container.clock.now().toISOString(),
		data,
	}) as AnyCommerceEvent;

const AWAIT_WAIT_MS = 3_000;
const AWAIT_POLL_MS = 20;

/** Polls until another worker that holds the claim has stored its record id. */
export const awaitIndexed = async (container: CommerceContainer, key: string, waitMs = AWAIT_WAIT_MS): Promise<string | null> => {
	const startedAt = Date.now();
	for (;;) {
		const found = await container.recordIndex.get(key);
		if (found) return found;
		if (Date.now() - startedAt >= waitMs) return null;
		await sleep(AWAIT_POLL_MS);
	}
};

export class RecordInProgressError extends Error {
	constructor(key: string) {
		super(`The record for ${key} is still being created by another worker`);
		this.name = "RecordInProgressError";
	}
}

export type ClaimResult = { isWinner: true } | { isWinner: false; recordId: string };

/**
 * Exactly-once gate: the winner creates the record and calls `recordIndex.set`; everyone else gets the
 * winner's id, waiting briefly for it. When the winner is still silent after the wait this throws so the
 * caller's event is retried (never creates a second record).
 */
export const claimOrAwait = async (container: CommerceContainer, key: string): Promise<ClaimResult> => {
	const claim = await container.recordIndex.claim(key);
	if (claim.isWinner) return { isWinner: true };
	if (claim.recordId) return { isWinner: false, recordId: claim.recordId };
	const recordId = await awaitIndexed(container, key);
	if (!recordId) throw new RecordInProgressError(key);
	return { isWinner: false, recordId };
};

export const unixSeconds = (container: CommerceContainer): number => Math.floor(container.clock.now().getTime() / 1000);

/** Identity of the provider event being handled: handlers derive deterministic event ids from it. */
export interface EventMeta {
	eventId: string;
	/** Provider timestamp in seconds. */
	created: number;
}

/** True when a provider object carries the metadata this plugin stamps on every checkout it creates. */
export const isCreatedByPlugin = (metadata: Record<string, string>): boolean =>
	Boolean(metadata[PROVIDER_METADATA.checkoutId] || metadata[PROVIDER_METADATA.cartId]);

/**
 * Whether the configured key is a live key (`sk_live_`, `rk_live_`), a test key, or unknown (null). Derived
 * from the key prefix: `describeAccount` is a network call and this runs on every webhook.
 */
export const keyLivemode = async (container: CommerceContainer): Promise<boolean | null> => {
	const key = (await container.secrets()).stripeSecretKey;
	if (!key) return null;
	if (/^[a-z]{2}_live_/.test(key)) return true;
	if (/^[a-z]{2}_test_/.test(key)) return false;
	return null;
};
