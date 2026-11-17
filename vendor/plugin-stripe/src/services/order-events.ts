import { ORDER_ACTOR_KIND, type OrderActorKind, type OrderTimelineEvent, type OrderTimelineType } from "../core/order-timeline.js";
import type { CommerceContainer } from "../plugin/container.js";
import { RECORD_INDEX_KEY, type Page } from "../ports/repositories.js";

/**
 * The one writer of the order timeline. Every payment transition, admin action, refund, dispute and email send
 * calls `recordOrderEvent`; nothing else creates an entry. An entry is idempotent on its source key
 * (`orderEventSourceKey`): recording the same transition or provider event twice stores it once, which is how a
 * retried webhook or a crash between "record" and "apply" never doubles the timeline.
 */

export interface RecordOrderEventInput {
	orderId: string;
	type: OrderTimelineType;
	message: string;
	actorKind?: OrderActorKind;
	actorLabel?: string | null;
	data?: Record<string, unknown> | null;
	/**
	 * What makes this occurrence unique within (order, type): a provider event or object id, or the transition
	 * (`paid>refunded`). Omit it for an event that happens once per order (`placed`). An event that may happen many
	 * times and has no natural id (a note, an admin action) passes a fresh id.
	 */
	source?: string;
}

const MAX_MESSAGE_LENGTH = 500;

export const orderEventSourceKey = (orderId: string, type: OrderTimelineType, source?: string): string =>
	source ? `${orderId}:${type}:${source}` : `${orderId}:${type}`;

export interface RecordedOrderEvent {
	/** False when this occurrence was already recorded (or is being recorded by a concurrent writer). */
	isNew: boolean;
	/** Null only while a concurrent writer is still creating the entry. */
	eventId: string | null;
}

/**
 * The source key is claimed in the record index first (an atomic compare-and-set), so two concurrent writers of the
 * same occurrence cannot both create an entry; the winner creates it and stores its id. A winner that fails to create
 * releases the claim, so the retry can record it. A winner that dies in between holds the claim until it goes stale.
 */
export const recordOrderEvent = async (container: CommerceContainer, input: RecordOrderEventInput): Promise<RecordedOrderEvent> => {
	const sourceKey = orderEventSourceKey(input.orderId, input.type, input.source);
	const indexKey = RECORD_INDEX_KEY.orderEventBySource(sourceKey);
	const claim = await container.recordIndex.claim(indexKey);
	if (!claim.isWinner) return { isNew: false, eventId: claim.recordId };
	try {
		const { event, isNew } = await container.orders.events.create({
			orderId: input.orderId,
			type: input.type,
			message: input.message.slice(0, MAX_MESSAGE_LENGTH),
			actorKind: input.actorKind ?? ORDER_ACTOR_KIND.system,
			actorLabel: input.actorLabel ?? null,
			data: input.data ?? null,
			occurredAt: container.clock.now().toISOString(),
			sourceKey,
		});
		await container.recordIndex.set(indexKey, event.id);
		return { isNew, eventId: event.id };
	} catch (error) {
		await container.recordIndex.releaseClaim(indexKey);
		throw error;
	}
};

/**
 * For paths that must not fail because the audit trail could not be written (webhooks, emails): a failure is
 * logged and swallowed. Admin actions whose only effect is the entry use `recordOrderEvent` and surface the error.
 */
export const tryRecordOrderEvent = async (container: CommerceContainer, input: RecordOrderEventInput): Promise<void> => {
	try {
		await recordOrderEvent(container, input);
	} catch (error) {
		container.log.warn("The order timeline entry could not be written", {
			orderId: input.orderId,
			type: input.type,
			error: error instanceof Error ? error.message : "unknown",
		});
	}
};

/** Newest first. */
export const listOrderEvents = (container: CommerceContainer, orderId: string, input: { cursor: string | null; limit: number }): Promise<Page<OrderTimelineEvent>> =>
	container.orders.events.listByOrder(orderId, input);
