import { describe, expect, it } from "vitest";

import { requestRefund } from "./refunds.js";
import { completeCheckout, createHarness, event, outboxEvent, paidOrder, providerDispute, providerRefund, seedCheckout } from "./payments/test-support.js";

const disputeEvent = (dispute: ReturnType<typeof providerDispute>, type = "charge.dispute.updated") => event({ kind: "dispute_updated", dispute }, { type });

describe("disputes", () => {
	it("opens, then restores the status the order had when the dispute is won", async () => {
		const h = createHarness();
		const { order, seeded } = await paidOrder(h);
		const dispute = providerDispute({ paymentIntentId: seeded.paymentIntentId });
		await h.deliver(disputeEvent(dispute, "charge.dispute.created"));
		expect(await h.container.orders.get(order.id)).toMatchObject({ paymentStatus: "disputed", statusBeforeDispute: "paid" });
		expect(await outboxEvent(h, "order.disputed", "dp_test_1")).toMatchObject({ data: { orderId: order.id, amount: 5000, reason: "fraudulent" } });

		await h.deliver(disputeEvent({ ...dispute, status: "won" }, "charge.dispute.closed"));
		expect(await h.container.orders.get(order.id)).toMatchObject({ paymentStatus: "paid", statusBeforeDispute: null });
		expect(await outboxEvent(h, "order.dispute_closed", "dp_test_1")).toMatchObject({ data: { outcome: "won" } });
	});

	it("restores partially_refunded, not paid, after a won dispute", async () => {
		const h = createHarness();
		const { order, seeded } = await paidOrder(h);
		await requestRefund(h.container, h.deps.publisher, { orderId: order.id, amount: 1000, reason: null, note: null, requestId: "req-dispute-01", requestedBy: null, restock: false });
		const dispute = providerDispute({ paymentIntentId: seeded.paymentIntentId });
		await h.deliver(disputeEvent(dispute));
		expect((await h.container.orders.get(order.id))!.statusBeforeDispute).toBe("partially_refunded");
		await h.deliver(disputeEvent({ ...dispute, status: "won" }));
		expect((await h.container.orders.get(order.id))!.paymentStatus).toBe("partially_refunded");
	});

	it("ends in dispute_lost when lost, and a late open event cannot reopen a closed dispute", async () => {
		const h = createHarness();
		const { order, seeded } = await paidOrder(h);
		const dispute = providerDispute({ paymentIntentId: seeded.paymentIntentId });
		await h.deliver(disputeEvent(dispute));
		await h.deliver(disputeEvent({ ...dispute, status: "lost" }, "charge.dispute.closed"));
		expect((await h.container.orders.get(order.id))!.paymentStatus).toBe("dispute_lost");
		expect(await outboxEvent(h, "order.dispute_closed", "dp_test_1")).toMatchObject({ data: { outcome: "lost" } });
		const late = await h.deliver(disputeEvent(dispute, "charge.dispute.created"));
		expect(late.outcome).toBe("ignored");
		expect((await h.container.orders.get(order.id))!.paymentStatus).toBe("dispute_lost");
	});

	it("does not reopen a won dispute either", async () => {
		const h = createHarness();
		const { order, seeded } = await paidOrder(h);
		const dispute = providerDispute({ paymentIntentId: seeded.paymentIntentId });
		await h.deliver(disputeEvent({ ...dispute, status: "won" }));
		expect((await h.container.orders.get(order.id))!.paymentStatus).toBe("paid");
		await h.deliver(disputeEvent(dispute));
		expect((await h.container.orders.get(order.id))!.paymentStatus).toBe("paid");
	});

	it("handles a closing event for a dispute whose open event was never seen", async () => {
		const h = createHarness();
		const { order, seeded } = await paidOrder(h);
		await h.deliver(disputeEvent({ ...providerDispute({ paymentIntentId: seeded.paymentIntentId }), status: "lost" }));
		expect((await h.container.orders.get(order.id))!.paymentStatus).toBe("dispute_lost");
	});

	it("applies a refund that landed while the order was disputed once the dispute is won", async () => {
		const h = createHarness();
		const { order, seeded } = await paidOrder(h);
		const dispute = providerDispute({ paymentIntentId: seeded.paymentIntentId });
		await h.deliver(disputeEvent(dispute));
		h.provider.paymentsById.set(seeded.paymentIntentId!, { ...h.provider.paymentsById.get(seeded.paymentIntentId!)!, amountRefunded: 5000 });
		await h.deliver(event({ kind: "refund_updated", refund: providerRefund({ refundId: "re_during", paymentIntentId: seeded.paymentIntentId, amount: 5000 }) }, { type: "refund.created" }));
		expect(await h.container.orders.get(order.id)).toMatchObject({ paymentStatus: "disputed", totals: { refunded: 5000 } });
		await h.deliver(disputeEvent({ ...dispute, status: "won" }));
		expect((await h.container.orders.get(order.id))!.paymentStatus).toBe("refunded");
	});

	it("finds the order through the charge when the dispute has no payment intent", async () => {
		const h = createHarness();
		const { order, seeded } = await paidOrder(h);
		const charge = h.provider.paymentsById.get(seeded.paymentIntentId!)!.latestChargeId!;
		await h.deliver(disputeEvent(providerDispute({ chargeId: charge, paymentIntentId: null })));
		expect((await h.container.orders.get(order.id))!.paymentStatus).toBe("disputed");
	});

	it("retries a dispute that arrives before settlement recorded our order, then applies it", async () => {
		const h = createHarness();
		const seeded = await seedCheckout(h);
		const complete = completeCheckout(h, seeded); // the session (and its PaymentIntent with our metadata) exists in Stripe
		const dispute = disputeEvent(providerDispute({ paymentIntentId: seeded.paymentIntentId }), "charge.dispute.created");
		const early = await h.deliver(dispute);
		expect(early.outcome).not.toBe("ignored");
		expect(early.outcome).not.toBe("processed");

		await h.deliver(complete);
		await h.deliver(dispute);
		const [order] = (await h.container.orders.list({ cursor: null, limit: 10 })).items;
		expect(order!.paymentStatus).toBe("disputed");
	});

	it("ignores a dispute on a payment this store does not know", async () => {
		const h = createHarness();
		const result = await h.deliver(disputeEvent(providerDispute({ chargeId: "ch_nobody", paymentIntentId: "pi_nobody" })));
		expect(result.outcome).toBe("ignored");
	});
});
