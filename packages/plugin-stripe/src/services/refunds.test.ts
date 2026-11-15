import { describe, expect, it } from "vitest";

import { CommerceError } from "../core/errors.js";
import { ProviderError } from "../ports/payment-provider.js";
import { RECORD_INDEX_KEY } from "../ports/repositories.js";
import { advance, allOrders, completeCheckout, createHarness, event, outboxEvent, paidOrder, providerRefund, seedCheckout } from "./payments/test-support.js";
import { processDueInbox } from "./webhook-inbox.js";
import { refundIdFor, requestRefund, type RefundRequest } from "./refunds.js";

const request = (orderId: string, over: Partial<RefundRequest> = {}): RefundRequest => ({
	orderId,
	amount: 2000,
	reason: "requested_by_customer",
	note: null,
	requestId: "req-00000001",
	requestedBy: "admin-1",
	restock: false,
	...over,
});

const refundEvent = (refund: ReturnType<typeof providerRefund>) => event({ kind: "refund_updated", refund }, { type: "refund.updated" });

describe("requestRefund", () => {
	it("records the refund first, calls the provider once with a key derived from the refund id, and updates the order", async () => {
		const h = createHarness();
		const { order, seeded } = await paidOrder(h);
		const refund = await requestRefund(h.container, h.deps.publisher, request(order.id));

		expect(refund).toMatchObject({ orderId: order.id, amount: 2000, status: "succeeded", reason: "requested_by_customer", requestedBy: "admin-1", currency: "pln" });
		expect(refund.id).toBe(await refundIdFor(order.id, "req-00000001"));
		expect(h.provider.callsOf("createRefund")).toHaveLength(1);
		expect(h.provider.callsOf("createRefund")[0]!.idempotencyKey).toBe(`stripe-commerce:refund:${refund.id}`);
		expect(h.provider.callsOf("createRefund")[0]!.args).toMatchObject({ refundRecordId: refund.id, paymentIntentId: seeded.paymentIntentId, amount: 2000 });
		expect(await h.container.orders.get(order.id)).toMatchObject({ paymentStatus: "partially_refunded", totals: { refunded: 2000, total: 5000 } });
		const paymentId = (await h.container.recordIndex.get(RECORD_INDEX_KEY.paymentByPaymentIntent(seeded.paymentIntentId!)))!;
		expect((await h.container.payments.get(paymentId))!.amountRefunded).toBe(2000);
		expect(await h.container.recordIndex.get(RECORD_INDEX_KEY.refundByProviderId(refund.stripeRefundId!))).toBe(refund.id);
		expect(await outboxEvent(h, "order.refunded", refund.id)).toMatchObject({ data: { amount: 2000, amountRefundedTotal: 2000, isFullyRefunded: false } });
	});

	it("is idempotent by requestId: the same id is the same refund and never a second provider call", async () => {
		const h = createHarness();
		const { order } = await paidOrder(h);
		const [a, b, c] = await Promise.all([
			requestRefund(h.container, h.deps.publisher, request(order.id)),
			requestRefund(h.container, h.deps.publisher, request(order.id)),
			requestRefund(h.container, h.deps.publisher, request(order.id)),
		]);
		const again = await requestRefund(h.container, h.deps.publisher, request(order.id, { amount: null }));
		expect(new Set([a.id, b.id, c.id, again.id]).size).toBe(1);
		expect(h.provider.refunds.size).toBe(1);
		expect(await h.container.refunds.listByOrder(order.id)).toHaveLength(1);
		expect((await h.container.orders.get(order.id))!.totals.refunded).toBe(2000);
	});

	it("rejects the same requestId with a different amount", async () => {
		const h = createHarness();
		const { order } = await paidOrder(h);
		await requestRefund(h.container, h.deps.publisher, request(order.id));
		await expect(requestRefund(h.container, h.deps.publisher, request(order.id, { amount: 3000 }))).rejects.toMatchObject({ kind: "conflict" });
	});

	it("completes a refund whose provider call failed, with the same idempotency key and no duplicate", async () => {
		const h = createHarness();
		const { order } = await paidOrder(h);
		h.provider.failNext("createRefund", new ProviderError("network", { isRetryable: true }));
		await expect(requestRefund(h.container, h.deps.publisher, request(order.id))).rejects.toBeInstanceOf(ProviderError);
		const [pending] = await h.container.refunds.listByOrder(order.id);
		expect(pending).toMatchObject({ status: "pending", stripeRefundId: null });

		const refund = await requestRefund(h.container, h.deps.publisher, request(order.id));
		expect(refund.status).toBe("succeeded");
		const calls = h.provider.callsOf("createRefund");
		expect(calls).toHaveLength(2);
		expect(calls[0]!.idempotencyKey).toBe(calls[1]!.idempotencyKey);
		expect(h.provider.refunds.size).toBe(1);
	});

	it("rejects more than is refundable, counting refunds still in flight, and records nothing", async () => {
		const h = createHarness();
		const { order } = await paidOrder(h);
		await expect(requestRefund(h.container, h.deps.publisher, request(order.id, { amount: 5001, requestId: "req-over-0001" }))).rejects.toMatchObject({ kind: "refundNotAllowed", details: { refundable: 5000 } });
		expect(await h.container.refunds.listByOrder(order.id)).toHaveLength(0);
		expect(h.provider.callsOf("createRefund")).toHaveLength(0);

		h.provider.failNext("createRefund", new ProviderError("network", { isRetryable: true }));
		await expect(requestRefund(h.container, h.deps.publisher, request(order.id, { amount: 4000, requestId: "req-pending-01" }))).rejects.toBeInstanceOf(ProviderError);
		await expect(requestRefund(h.container, h.deps.publisher, request(order.id, { amount: 1001, requestId: "req-second-001" }))).rejects.toMatchObject({ kind: "refundNotAllowed", details: { refundable: 1000 } });
		await expect(requestRefund(h.container, h.deps.publisher, request(order.id, { amount: 0, requestId: "req-zero-0001" }))).rejects.toBeInstanceOf(CommerceError);
	});

	it("lets two concurrent requests that together exceed the total through only once", async () => {
		const h = createHarness();
		const { order } = await paidOrder(h);
		const results = await Promise.allSettled([
			requestRefund(h.container, h.deps.publisher, request(order.id, { amount: 3000, requestId: "req-race-0001" })),
			requestRefund(h.container, h.deps.publisher, request(order.id, { amount: 3000, requestId: "req-race-0002" })),
		]);
		expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
		expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
		expect(h.provider.refunds.size).toBe(1);
		expect((await h.container.orders.get(order.id))!.totals.refunded).toBe(3000);
	});

	it("refunds partially, then the rest, ending refunded; nothing is left to refund after that", async () => {
		const h = createHarness();
		const { order } = await paidOrder(h);
		await requestRefund(h.container, h.deps.publisher, request(order.id, { amount: 2000, requestId: "req-part-0001" }));
		const rest = await requestRefund(h.container, h.deps.publisher, request(order.id, { amount: null, requestId: "req-part-0002" }));
		expect(rest.amount).toBe(3000);
		expect(await h.container.orders.get(order.id)).toMatchObject({ paymentStatus: "refunded", totals: { refunded: 5000 } });
		expect(await outboxEvent(h, "order.refunded", rest.id)).toMatchObject({ data: { isFullyRefunded: true, amountRefundedTotal: 5000 } });
		await expect(requestRefund(h.container, h.deps.publisher, request(order.id, { amount: null, requestId: "req-part-0003" }))).rejects.toMatchObject({ kind: "refundNotAllowed" });
	});

	it("refuses an order that is not paid", async () => {
		const h = createHarness();
		const { order } = await paidOrder(h);
		await h.container.orders.update(order.id, { paymentStatus: "pending" });
		await expect(requestRefund(h.container, h.deps.publisher, request(order.id))).rejects.toMatchObject({ kind: "refundNotAllowed" });
		await expect(requestRefund(h.container, h.deps.publisher, request("missing", { requestId: "req-missing-01" }))).rejects.toMatchObject({ kind: "notFound" });
	});

	it("puts stock back for a full refund with restock, and only for it", async () => {
		const h = createHarness();
		const { order, seeded } = await paidOrder(h);
		expect(await h.container.inventory.get(seeded.sellable)).toMatchObject({ onHand: 8 });
		await expect(requestRefund(h.container, h.deps.publisher, request(order.id, { amount: 1000, restock: true, requestId: "req-stock-0001" }))).rejects.toMatchObject({ kind: "invalidInput" });
		await requestRefund(h.container, h.deps.publisher, request(order.id, { amount: 1000, restock: false, restockLines: [{ priceId: seeded.priceId, quantity: 1 }], requestId: "req-stock-0002" }));
		expect(await h.container.inventory.get(seeded.sellable)).toMatchObject({ onHand: 9 });
		expect(h.mirrorCalls.at(-1)).toEqual({ variantId: seeded.sellable.id, onHand: 9 });
		await expect(requestRefund(h.container, h.deps.publisher, request(order.id, { amount: 1000, restockLines: [{ priceId: seeded.priceId, quantity: 9 }], requestId: "req-stock-0003" }))).rejects.toMatchObject({ kind: "invalidInput" });

		const full = await paidOrder(h, { quantity: 1 });
		await requestRefund(h.container, h.deps.publisher, request(full.order.id, { amount: null, restock: true, requestId: "req-stock-0004" }));
		expect(await h.container.inventory.get(full.seeded.sellable)).toMatchObject({ onHand: 10 });
		// Replaying the refund webhook must not restock again.
		const stored = (await h.container.refunds.listByOrder(full.order.id))[0]!;
		await h.deliver(refundEvent(providerRefund({ refundId: stored.stripeRefundId!, paymentIntentId: full.seeded.paymentIntentId, amount: stored.amount, refundRecordId: stored.id })));
		expect(await h.container.inventory.get(full.seeded.sellable)).toMatchObject({ onHand: 10 });
	});
});

describe("refund webhooks", () => {
	it("records a refund made in the Stripe dashboard, and a replay is cumulative, never added twice", async () => {
		const h = createHarness();
		const { order, seeded } = await paidOrder(h);
		h.provider.paymentsById.set(seeded.paymentIntentId!, { ...h.provider.paymentsById.get(seeded.paymentIntentId!)!, amountRefunded: 1000 });
		const refund = providerRefund({ refundId: "re_dash_1", paymentIntentId: seeded.paymentIntentId, amount: 1000 });
		expect((await h.deliver(refundEvent(refund))).outcome).toBe("processed");
		expect((await h.deliver(refundEvent(refund))).outcome).toBe("processed");
		expect((await h.deliver(refundEvent({ ...refund, status: "succeeded" }))).outcome).toBe("processed");

		expect(await h.container.orders.get(order.id)).toMatchObject({ paymentStatus: "partially_refunded", totals: { refunded: 1000 } });
		const records = await h.container.refunds.listByOrder(order.id);
		expect(records).toEqual([expect.objectContaining({ id: "rf_re_dash_1", amount: 1000, status: "succeeded", stripeRefundId: "re_dash_1", requestedBy: null })]);
		expect(await outboxEvent(h, "order.refunded", "rf_re_dash_1")).not.toBeNull();
	});

	it("marks the order refunded from the provider's cumulative total", async () => {
		const h = createHarness();
		const { order, seeded } = await paidOrder(h);
		h.provider.paymentsById.set(seeded.paymentIntentId!, { ...h.provider.paymentsById.get(seeded.paymentIntentId!)!, amountRefunded: 5000 });
		await h.deliver(refundEvent(providerRefund({ refundId: "re_dash_full", paymentIntentId: seeded.paymentIntentId, amount: 5000 })));
		expect(await h.container.orders.get(order.id)).toMatchObject({ paymentStatus: "refunded", totals: { refunded: 5000 } });
	});

	it("applies the webhook of a refund we requested to the same record, and a late pending event does not revert it", async () => {
		const h = createHarness();
		const { order, seeded } = await paidOrder(h);
		const refund = await requestRefund(h.container, h.deps.publisher, request(order.id));
		await h.deliver(refundEvent(providerRefund({ refundId: refund.stripeRefundId!, paymentIntentId: seeded.paymentIntentId, amount: 2000, refundRecordId: refund.id, status: "pending" })));
		expect(await h.container.refunds.get(refund.id)).toMatchObject({ status: "succeeded" });
		expect(await h.container.refunds.listByOrder(order.id)).toHaveLength(1);
		expect((await h.container.orders.get(order.id))!.totals.refunded).toBe(2000);
	});

	it("moves a pending refund to succeeded when the webhook says so", async () => {
		const h = createHarness();
		const { order, seeded } = await paidOrder(h);
		h.provider.failNext("createRefund", new ProviderError("network", { isRetryable: true }));
		await requestRefund(h.container, h.deps.publisher, request(order.id)).catch(() => undefined);
		const [pending] = await h.container.refunds.listByOrder(order.id);
		h.provider.paymentsById.set(seeded.paymentIntentId!, { ...h.provider.paymentsById.get(seeded.paymentIntentId!)!, amountRefunded: 2000 });
		await h.deliver(refundEvent(providerRefund({ refundId: "re_late", paymentIntentId: seeded.paymentIntentId, amount: 2000, refundRecordId: pending!.id })));
		expect(await h.container.refunds.get(pending!.id)).toMatchObject({ status: "succeeded", stripeRefundId: "re_late" });
		expect((await h.container.orders.get(order.id))!.paymentStatus).toBe("partially_refunded");
	});

	it("retries a dashboard refund that arrives before settlement recorded our order", async () => {
		const h = createHarness();
		const seeded = await seedCheckout(h);
		completeCheckout(h, seeded);
		const result = await h.deliver(refundEvent(providerRefund({ refundId: "re_early", paymentIntentId: seeded.paymentIntentId, amount: 100 })));
		expect(result.outcome).not.toBe("ignored");
		expect(result.outcome).not.toBe("processed");
	});

	it("ignores a refund of a payment this store does not know", async () => {
		const h = createHarness();
		const result = await h.deliver(refundEvent(providerRefund({ refundId: "re_x", paymentIntentId: "pi_unknown", amount: 100 })));
		expect(result.outcome).toBe("ignored");
		expect(await allOrders(h)).toHaveLength(0);
	});

	it("retries a refund event that arrives before the payment is recorded", async () => {
		const h = createHarness();
		const { order, seeded } = await paidOrder(h);
		const key = RECORD_INDEX_KEY.paymentByPaymentIntent(seeded.paymentIntentId!);
		const paymentId = (await h.container.recordIndex.get(key))!;
		await h.container.recordIndex.set(key, "");
		h.provider.paymentsById.set(seeded.paymentIntentId!, { ...h.provider.paymentsById.get(seeded.paymentIntentId!)!, amountRefunded: 100 });
		const result = await h.deliver(refundEvent(providerRefund({ refundId: "re_early", paymentIntentId: seeded.paymentIntentId, amount: 100 })));
		expect(result.outcome).toBe("failed");
		await h.container.recordIndex.set(key, paymentId);
		advance(h, 60_000);
		expect((await processDueInbox(h.container, 10)).processed).toBe(1);
		expect((await h.container.orders.get(order.id))!.totals.refunded).toBe(100);
	});
});
