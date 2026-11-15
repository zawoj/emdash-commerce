import type { z } from "zod";

import type { adminOrdersActionInput, adminOrdersFulfillmentInput, adminOrdersNoteInput } from "../../contracts/api.js";
import { CommerceError } from "../../core/errors.js";
import { commerceEventId, type AnyCommerceEvent } from "../../core/events.js";
import { ORDER_ACTION, planFulfillmentChange, planOrderAction, type OrderAction } from "../../core/order-lifecycle.js";
import { ORDER_ACTOR_KIND, ORDER_TIMELINE_TYPE } from "../../core/order-timeline.js";
import type { Order } from "../../core/order.js";
import type { CommerceContainer } from "../../plugin/container.js";
import { LOCK_KEY, withLock } from "../locks.js";
import { recordOrderEvent } from "../order-events.js";
import { callerLabel, type AdminCaller, type AdminContext } from "./context.js";
import { toOrderSummary, type OrderSummary } from "./orders.js";

/**
 * The human-driven axes of an order: the lifecycle (complete, cancel, archive, reopen) and fulfillment. Both are
 * plugin-owned data an editor cannot change in the content editor (read-only fields), so these are the only paths.
 * Each runs inside the order's lock on a freshly read order, so it cannot overwrite a concurrent refund or dispute
 * projection on the same row, records one timeline entry and announces a domain event.
 */

const loadLocked = async (container: CommerceContainer, orderId: string): Promise<Order> => {
	const order = await container.orders.get(orderId);
	if (!order) throw new CommerceError("notFound", "Order not found");
	return order;
};

const eventFor = (container: CommerceContainer, order: Order, action: OrderAction, previous: Order["orderStatus"], occurrence: string): AnyCommerceEvent => {
	const base = { orderId: order.id, orderNumber: order.orderNumber };
	const occurredAt = container.clock.now().toISOString();
	const id = (type: AnyCommerceEvent["type"]) => commerceEventId(type, `${order.id}:${occurrence}`);
	switch (action) {
		case ORDER_ACTION.complete:
			return { id: id("order.completed"), type: "order.completed", occurredAt, data: base };
		case ORDER_ACTION.cancel:
			return { id: id("order.cancelled"), type: "order.cancelled", occurredAt, data: base };
		case ORDER_ACTION.archive:
			return { id: id("order.archived"), type: "order.archived", occurredAt, data: base };
		case ORDER_ACTION.reopen:
			return { id: id("order.reopened"), type: "order.reopened", occurredAt, data: { ...base, previousStatus: previous } };
	}
};

export const performOrderAction = async (
	{ container, publisher }: AdminContext,
	input: z.infer<typeof adminOrdersActionInput>,
	caller: AdminCaller | null | undefined,
): Promise<OrderSummary> => {
	const occurrence = container.ids.randomId(6);
	const result = await withLock(container, LOCK_KEY.order(input.orderId), async () => {
		const order = await loadLocked(container, input.orderId);
		const plan = planOrderAction(order, input.action);
		if (!plan.isAllowed) throw new CommerceError("conflict", plan.reason, { action: input.action, orderStatus: order.orderStatus });
		const updated = await container.orders.update(order.id, { orderStatus: plan.next });
		await recordOrderEvent(container, {
			orderId: order.id,
			type: ORDER_TIMELINE_TYPE.orderStatusChanged,
			message: `Order status changed from ${order.orderStatus} to ${plan.next}`,
			actorKind: ORDER_ACTOR_KIND.admin,
			actorLabel: callerLabel(caller),
			data: { from: order.orderStatus, to: plan.next, action: input.action },
			source: occurrence,
		});
		return { updated, previous: order.orderStatus };
	});
	await publisher.publish([eventFor(container, result.updated, input.action, result.previous, occurrence)]);
	return toOrderSummary(result.updated);
};

export const setFulfillment = async (
	{ container, publisher }: AdminContext,
	input: z.infer<typeof adminOrdersFulfillmentInput>,
	caller: AdminCaller | null | undefined,
): Promise<OrderSummary> => {
	const occurrence = container.ids.randomId(6);
	const result = await withLock(container, LOCK_KEY.order(input.orderId), async () => {
		const order = await loadLocked(container, input.orderId);
		// Setting the current value is a no-op, not an error (an MCP client may repeat the call).
		if (order.fulfillmentStatus === input.fulfillmentStatus) return { updated: order, previous: order.fulfillmentStatus, isChanged: false };
		const plan = planFulfillmentChange(order, input.fulfillmentStatus);
		if (!plan.isAllowed) throw new CommerceError("conflict", plan.reason, { fulfillmentStatus: input.fulfillmentStatus, orderStatus: order.orderStatus });
		const updated = await container.orders.update(order.id, { fulfillmentStatus: plan.next });
		await recordOrderEvent(container, {
			orderId: order.id,
			type: ORDER_TIMELINE_TYPE.fulfillmentStatusChanged,
			message: `Fulfillment changed from ${order.fulfillmentStatus} to ${plan.next}`,
			actorKind: ORDER_ACTOR_KIND.admin,
			actorLabel: callerLabel(caller),
			data: { from: order.fulfillmentStatus, to: plan.next },
			source: occurrence,
		});
		return { updated, previous: order.fulfillmentStatus, isChanged: true };
	});
	if (result.isChanged) {
		await publisher.publish([
			{
				id: commerceEventId("order.fulfillment_changed", `${result.updated.id}:${occurrence}`),
				type: "order.fulfillment_changed",
				occurredAt: container.clock.now().toISOString(),
				data: {
					orderId: result.updated.id,
					orderNumber: result.updated.orderNumber,
					fulfillmentStatus: result.updated.fulfillmentStatus,
					previousStatus: result.previous,
				},
			},
		]);
	}
	return toOrderSummary(result.updated);
};

/** An internal note on the timeline (the order's own `notes` field stays free text in the editor). */
export const addOrderNote = async (
	container: CommerceContainer,
	input: z.infer<typeof adminOrdersNoteInput>,
	caller: AdminCaller | null | undefined,
): Promise<{ id: string }> => {
	await loadLocked(container, input.orderId);
	const { eventId } = await recordOrderEvent(container, {
		orderId: input.orderId,
		type: ORDER_TIMELINE_TYPE.note,
		message: input.note,
		actorKind: ORDER_ACTOR_KIND.admin,
		actorLabel: callerLabel(caller),
		source: container.ids.randomId(6),
	});
	return { id: eventId ?? "" };
};
