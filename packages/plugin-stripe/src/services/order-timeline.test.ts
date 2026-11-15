import { describe, expect, it } from "vitest";

import { ORDER_TIMELINE_TYPE } from "../core/order-timeline.js";
import type { OrderTimelineEvent } from "../core/order-timeline.js";
import { commerceEventId } from "../core/events.js";
import { requestRefund } from "./refunds.js";
import { listOrderEvents } from "./order-events.js";
import { createEmailSubscriber } from "./subscribers/emails.js";
import { completeCheckout, createHarness, event, paidOrder, providerDispute, providerRefund, seedCheckout, type Harness } from "./payments/test-support.js";

/** The timeline an order accumulates through the money paths: every transition, refund, dispute and email records once. */

const timeline = async (h: Harness, orderId: string): Promise<OrderTimelineEvent[]> => (await listOrderEvents(h.container, orderId, { cursor: null, limit: 100 })).items;
const typesOf = (events: OrderTimelineEvent[]): string[] => events.map((entry) => entry.type).sort();
const disputeEvent = (dispute: ReturnType<typeof providerDispute>, type = "charge.dispute.updated") => event({ kind: "dispute_updated", dispute }, { type });

describe("order timeline through settlement", () => {
	it("records placed and the pending-to-paid transition, once even when the checkout is delivered again", async () => {
		const h = createHarness();
		const seeded = await seedCheckout(h);
		const delivery = completeCheckout(h, seeded);
		await h.deliver(delivery);
		const order = (await h.container.orders.findByCheckoutSession(seeded.sessionId))!;
		const entries = await timeline(h, order.id);
		// The confirmation email goes out inline with the built-in subscribers, so it is on the timeline too.
		expect(typesOf(entries)).toEqual([ORDER_TIMELINE_TYPE.emailSent, ORDER_TIMELINE_TYPE.paymentStatusChanged, ORDER_TIMELINE_TYPE.placed]);
		expect(entries.find((entry) => entry.type === "placed")).toMatchObject({ actorKind: "customer", data: { sessionId: seeded.sessionId, total: 5000, currency: "pln", mode: "payment" } });
		expect(entries.find((entry) => entry.type === "payment_status_changed")).toMatchObject({ actorKind: "provider", data: { from: "pending", to: "paid" }, message: "Payment status changed from pending to paid" });
		await h.deliver(completeCheckout(h, seeded));
		await h.deliver(delivery);
		expect(await timeline(h, order.id)).toHaveLength(3);
	});

	it("records the failed payment of an async checkout", async () => {
		const h = createHarness();
		const seeded = await seedCheckout(h);
		await h.deliver(completeCheckout(h, seeded, { paymentStatus: "unpaid" }));
		await h.deliver(event({ kind: "checkout_async_failed", sessionId: seeded.sessionId }, { type: "checkout.session.async_payment_failed" }));
		const order = (await h.container.orders.findByCheckoutSession(seeded.sessionId))!;
		expect((await timeline(h, order.id)).find((entry) => entry.type === "payment_status_changed")).toMatchObject({ data: { from: "pending", to: "failed" } });
	});
});

describe("order timeline through refunds and disputes", () => {
	it("records the refund once per refund id, and the payment status change it causes", async () => {
		const h = createHarness();
		const { order } = await paidOrder(h);
		const refund = await requestRefund(h.container, h.deps.publisher, { orderId: order.id, amount: 2000, reason: "duplicate", note: null, requestId: "req-timeline-1", requestedBy: "admin@x.y (u1)", restock: false });
		await requestRefund(h.container, h.deps.publisher, { orderId: order.id, amount: 2000, reason: "duplicate", note: null, requestId: "req-timeline-1", requestedBy: "admin@x.y (u1)", restock: false });
		const entries = await timeline(h, order.id);
		const created = entries.filter((entry) => entry.type === "refund_created");
		expect(created).toHaveLength(1);
		expect(created[0]).toMatchObject({ actorKind: "admin", actorLabel: "admin@x.y (u1)", data: { refundId: refund.id, amount: 2000, currency: "pln", reason: "duplicate" } });
		expect(entries.filter((entry) => entry.type === "payment_status_changed").map((entry) => entry.data)).toEqual(
			expect.arrayContaining([{ from: "paid", to: "partially_refunded" }]),
		);
	});

	it("records a refund made in the Stripe dashboard as a provider action", async () => {
		const h = createHarness();
		const { order, seeded } = await paidOrder(h);
		const refund = providerRefund({ refundId: "re_dash_1", paymentIntentId: seeded.paymentIntentId, amount: 1000 });
		h.provider.paymentsById.set(seeded.paymentIntentId!, { ...h.provider.paymentsById.get(seeded.paymentIntentId!)!, amountRefunded: 1000 });
		await h.deliver(event({ kind: "refund_updated", refund }, { type: "refund.created" }));
		const created = (await timeline(h, order.id)).filter((entry) => entry.type === "refund_created");
		expect(created).toEqual([expect.objectContaining({ actorKind: "provider", data: expect.objectContaining({ refundId: "rf_re_dash_1", amount: 1000 }) })]);
	});

	it("records the dispute opening and closing once, and the status changes around them", async () => {
		const h = createHarness();
		const { order, seeded } = await paidOrder(h);
		const dispute = providerDispute({ paymentIntentId: seeded.paymentIntentId });
		await h.deliver(disputeEvent(dispute, "charge.dispute.created"));
		await h.deliver(disputeEvent(dispute, "charge.dispute.created"));
		await h.deliver(disputeEvent({ ...dispute, status: "won" }, "charge.dispute.closed"));
		const entries = await timeline(h, order.id);
		expect(entries.filter((entry) => entry.type === "dispute_opened")).toEqual([expect.objectContaining({ actorKind: "provider", message: "Dispute opened (fraudulent)", data: expect.objectContaining({ disputeId: "dp_test_1", amount: 5000 }) })]);
		expect(entries.filter((entry) => entry.type === "dispute_closed")).toEqual([expect.objectContaining({ message: "Dispute closed: won", data: expect.objectContaining({ outcome: "won" }) })]);
		const changes = entries.filter((entry) => entry.type === "payment_status_changed").map((entry) => entry.data);
		expect(changes).toEqual(expect.arrayContaining([{ from: "paid", to: "disputed" }, { from: "disputed", to: "paid" }]));
	});

	it("keeps two disputes of one order apart (the dispute id is part of the key)", async () => {
		const h = createHarness();
		const { order, seeded } = await paidOrder(h);
		for (const disputeId of ["dp_a", "dp_b"]) {
			const dispute = providerDispute({ disputeId, paymentIntentId: seeded.paymentIntentId });
			await h.deliver(disputeEvent(dispute, "charge.dispute.created"));
			await h.deliver(disputeEvent({ ...dispute, status: "won" }, "charge.dispute.closed"));
		}
		const entries = await timeline(h, order.id);
		expect(entries.filter((entry) => entry.type === "dispute_opened")).toHaveLength(2);
		expect(entries.filter((entry) => entry.type === "payment_status_changed" && JSON.stringify(entry.data) === JSON.stringify({ from: "paid", to: "disputed" }))).toHaveLength(2);
	});
});

describe("order timeline through emails", () => {
	it("records each email once per domain event, and nothing when no provider accepted it", async () => {
		const h = createHarness();
		const { order } = await paidOrder(h);
		// The inline delivery already sent the confirmation; handling the same domain event again records nothing new.
		const subscriber = createEmailSubscriber(h.container);
		const paid = { id: commerceEventId("order.paid", order.id), type: "order.paid" as const, occurredAt: h.world.clock.now().toISOString(), data: { orderId: order.id, orderNumber: order.orderNumber, amount: 5000, currency: "pln" } };
		await subscriber.handle(paid, {} as never);
		await subscriber.handle(paid, {} as never);
		const sent = (await timeline(h, order.id)).filter((entry) => entry.type === "email_sent");
		expect(sent).toEqual([expect.objectContaining({ actorKind: "system", message: "Email sent: order confirmation", data: expect.objectContaining({ template: "order.paid" }) })]);

		const h2 = createHarness();
		h2.container.mailer = { send: async () => false };
		const second = await paidOrder(h2);
		await createEmailSubscriber(h2.container).handle({ ...paid, id: commerceEventId("order.paid", second.order.id), data: { ...paid.data, orderId: second.order.id } }, {} as never);
		expect((await timeline(h2, second.order.id)).filter((entry) => entry.type === "email_sent")).toEqual([]);
	});
});
