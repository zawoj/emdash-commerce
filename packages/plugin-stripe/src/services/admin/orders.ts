import type { z } from "zod";

import type { adminOrdersGetInput, adminOrdersListInput, adminOrdersRefundInput, adminSubscriptionsCancelInput } from "../../contracts/api.js";
import { CommerceError } from "../../core/errors.js";
import { ORDER_LIFECYCLE_STATUS, ORDER_PAYMENT_STATUS, type Order, type OrderLifecycleStatus, type OrderPaymentStatus } from "../../core/order.js";
import type { OrderTimelineEvent } from "../../core/order-timeline.js";
import type { Payment, Refund } from "../../core/payment.js";
import type { Subscription } from "../../core/subscription.js";
import { RECORD_INDEX_KEY } from "../../ports/repositories.js";
import type { CommerceContainer } from "../../plugin/container.js";
import { listOrderEvents } from "../order-events.js";
import { requestRefund } from "../refunds.js";
import { cancelSubscription } from "../subscriptions.js";
import { callerLabel, type AdminCaller, type AdminContext } from "./context.js";

export interface OrderSummary {
	id: string;
	orderNumber: string;
	/** Lifecycle axis. */
	orderStatus: Order["orderStatus"];
	/** Payment axis. */
	paymentStatus: Order["paymentStatus"];
	fulfillmentStatus: Order["fulfillmentStatus"];
	email: string;
	total: number;
	refunded: number;
	currency: string;
	placedAt: string;
	hasReviewFlags: boolean;
}

export const toOrderSummary = (order: Order): OrderSummary => ({
	id: order.id,
	orderNumber: order.orderNumber,
	orderStatus: order.orderStatus,
	paymentStatus: order.paymentStatus,
	fulfillmentStatus: order.fulfillmentStatus,
	email: order.email,
	total: order.totals.total,
	refunded: order.totals.refunded,
	currency: order.totals.currency,
	placedAt: order.placedAt,
	hasReviewFlags: order.reviewFlags.length > 0,
});

const isPaymentStatus = (value: string): value is OrderPaymentStatus => (Object.values(ORDER_PAYMENT_STATUS) as string[]).includes(value);
const isLifecycleStatus = (value: string): value is OrderLifecycleStatus => (Object.values(ORDER_LIFECYCLE_STATUS) as string[]).includes(value);

export const listOrders = async (container: CommerceContainer, input: z.infer<typeof adminOrdersListInput>): Promise<{ items: OrderSummary[]; cursor: string | null }> => {
	if (input.status !== undefined && !isPaymentStatus(input.status)) {
		throw new CommerceError("invalidInput", "Unknown payment status", { allowed: Object.values(ORDER_PAYMENT_STATUS) });
	}
	if (input.orderStatus !== undefined && !isLifecycleStatus(input.orderStatus)) {
		throw new CommerceError("invalidInput", "Unknown order status", { allowed: Object.values(ORDER_LIFECYCLE_STATUS) });
	}
	const page = await container.orders.list({
		...(input.status ? { status: input.status as OrderPaymentStatus } : {}),
		...(input.orderStatus ? { orderStatus: input.orderStatus as OrderLifecycleStatus } : {}),
		cursor: input.cursor,
		limit: input.limit,
	});
	return { items: page.items.map(toOrderSummary), cursor: page.cursor };
};

export interface OrderDetail {
	order: Order;
	payments: Payment[];
	refunds: Refund[];
	subscription: Subscription | null;
	/** The latest timeline entries, newest first (the editor's Timeline panel pages through the rest). */
	events: OrderTimelineEvent[];
}

/** Finds an order by id, or by its human number through the record index written at settlement. */
export const findOrder = async (container: CommerceContainer, input: z.infer<typeof adminOrdersGetInput>): Promise<Order> => {
	const orderId = input.orderId ?? (input.orderNumber ? await container.recordIndex.get(RECORD_INDEX_KEY.orderByNumber(input.orderNumber)) : null);
	const order = orderId ? await container.orders.get(orderId) : null;
	if (!order) throw new CommerceError("notFound", "Order not found");
	return order;
};

const DETAIL_EVENT_LIMIT = 20;

export const getOrderDetail = async (container: CommerceContainer, input: z.infer<typeof adminOrdersGetInput>): Promise<OrderDetail> => {
	const order = await findOrder(container, input);
	const subscriptionId = order.subscriptionId;
	const [payments, refunds, subscription, events] = await Promise.all([
		container.payments.listByOrder(order.id),
		container.refunds.listByOrder(order.id),
		subscriptionId ? container.subscriptions.get(subscriptionId) : Promise.resolve(null),
		listOrderEvents(container, order.id, { cursor: null, limit: DETAIL_EVENT_LIMIT }),
	]);
	return { order, payments, refunds, subscription, events: events.items };
};

/** Money action. `requestId` makes a repeated request resolve to the same refund (see services/refunds.ts). */
export const refundOrder = async (
	{ container, publisher }: AdminContext,
	input: z.infer<typeof adminOrdersRefundInput>,
	caller: AdminCaller | null | undefined,
): Promise<Refund> =>
	requestRefund(container, publisher, {
		orderId: input.orderId,
		amount: input.amount ?? null,
		reason: input.reason ?? null,
		note: input.note ?? null,
		requestId: input.requestId,
		requestedBy: callerLabel(caller),
		restock: input.restock,
	});

export const cancelOrderSubscription = async (
	{ container, publisher }: AdminContext,
	input: z.infer<typeof adminSubscriptionsCancelInput>,
): Promise<Subscription> => cancelSubscription(container, publisher, input);
