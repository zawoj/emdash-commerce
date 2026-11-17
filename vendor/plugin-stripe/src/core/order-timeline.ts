/**
 * The order timeline: an append-only log of what happened to an order. `recordOrderEvent`
 * (services/order-events.ts) is its only writer; the Timeline panel on the order reads it.
 * Not to be confused with `ORDER_EVENT` (order.ts), the provider events that drive the payment axis.
 */

export const ORDER_TIMELINE_TYPE = {
	placed: "placed",
	paymentStatusChanged: "payment_status_changed",
	orderStatusChanged: "order_status_changed",
	fulfillmentStatusChanged: "fulfillment_status_changed",
	refundCreated: "refund_created",
	disputeOpened: "dispute_opened",
	disputeClosed: "dispute_closed",
	emailSent: "email_sent",
	note: "note",
} as const;
export type OrderTimelineType = (typeof ORDER_TIMELINE_TYPE)[keyof typeof ORDER_TIMELINE_TYPE];

export const ORDER_ACTOR_KIND = {
	system: "system",
	admin: "admin",
	provider: "provider",
	customer: "customer",
} as const;
export type OrderActorKind = (typeof ORDER_ACTOR_KIND)[keyof typeof ORDER_ACTOR_KIND];

export interface OrderTimelineEvent {
	id: string;
	orderId: string;
	type: OrderTimelineType;
	message: string;
	actorKind: OrderActorKind;
	/** Who, for `admin` (an email or user id); null otherwise. */
	actorLabel: string | null;
	/** Small structured facts (statuses, amounts, provider ids); never secrets or personal data beyond the order's own. */
	data: Record<string, unknown> | null;
	occurredAt: string;
	/**
	 * Idempotency key, unique across the log: recording the same key twice stores one entry. Derived from the
	 * order id, the kind and the provider event or transition it describes (`orderEventSourceKey`).
	 */
	sourceKey: string;
}
