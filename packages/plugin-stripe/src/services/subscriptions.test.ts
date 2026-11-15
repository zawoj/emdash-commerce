import { describe, expect, it } from "vitest";

import { RECORD_INDEX_KEY } from "../ports/repositories.js";
import { cancelSubscription } from "./subscriptions.js";
import { allOrders, completeCheckout, createHarness, event, outboxEvent, providerInvoice, providerSubscription, seedCheckout, type Harness } from "./payments/test-support.js";

const subEvent = (subscription: ReturnType<typeof providerSubscription>, created: number, type = "customer.subscription.updated", eventId?: string) =>
	event({ kind: "subscription_updated", subscription }, { type, created, ...(eventId ? { eventId } : {}) });

const recordOf = async (h: Harness, providerId = "sub_test_1") => {
	const id = await h.container.recordIndex.get(RECORD_INDEX_KEY.subscriptionByProviderId(providerId));
	return id ? await h.container.subscriptions.get(id) : null;
};

describe("subscription events", () => {
	it("creates the record by provider id and announces it once", async () => {
		const h = createHarness();
		await h.deliver(subEvent(providerSubscription({ status: "trialing", trialEnd: 1_769_000_000 }), 1000, "customer.subscription.created"));
		const record = (await recordOf(h))!;
		expect(record).toMatchObject({
			status: "trialing",
			interval: "month",
			amount: 2500,
			currency: "pln",
			trialEnd: new Date(1_769_000_000_000).toISOString(),
			stripe: { subscriptionId: "sub_test_1", customerId: "cus_test_1" },
			providerUpdatedAt: 1000,
		});
		expect(await outboxEvent(h, "subscription.created", record.id)).toMatchObject({ data: { status: "trialing", subscriptionId: record.id } });
		await h.deliver(subEvent(providerSubscription({ status: "trialing", trialEnd: 1_769_000_000 }), 1000, "customer.subscription.created"));
		expect(await recordOf(h)).toMatchObject({ id: record.id });
	});

	it("emits updated with the previous status, then canceled", async () => {
		const h = createHarness();
		await h.deliver(subEvent(providerSubscription({ status: "active" }), 1000));
		await h.deliver(subEvent(providerSubscription({ status: "past_due" }), 2000, undefined, "evt_pd"));
		const record = (await recordOf(h))!;
		expect(await outboxEvent(h, "subscription.updated", `${record.id}:evt_pd`)).toMatchObject({ data: { status: "past_due", previousStatus: "active", cancelAtPeriodEnd: false } });
		await h.deliver(subEvent(providerSubscription({ status: "canceled", canceledAt: 3000 }), 3000, "customer.subscription.deleted"));
		expect((await recordOf(h))!.status).toBe("canceled");
		expect(await outboxEvent(h, "subscription.canceled", record.id)).not.toBeNull();
	});

	it("ignores an event older than the stored state, whichever order they arrive in", async () => {
		const h = createHarness();
		await h.deliver(subEvent(providerSubscription({ status: "active" }), 5000));
		const late = await h.deliver(subEvent(providerSubscription({ status: "incomplete" }), 4000));
		expect(late.outcome).toBe("ignored");
		expect((await recordOf(h))!).toMatchObject({ status: "active", providerUpdatedAt: 5000 });
		await h.deliver(subEvent(providerSubscription({ status: "past_due" }), 6000));
		expect((await recordOf(h))!.status).toBe("past_due");
	});

	it("ignores a subscription this plugin did not create", async () => {
		const h = createHarness();
		const result = await h.deliver(subEvent(providerSubscription({ metadata: {} }), 1000));
		expect(result.outcome).toBe("ignored");
		expect(await recordOf(h)).toBeNull();
	});

	it("announces the end of a trial for a known subscription only", async () => {
		const h = createHarness();
		await h.deliver(subEvent(providerSubscription(), 1000));
		const record = (await recordOf(h))!;
		await h.deliver(event({ kind: "subscription_trial_will_end", subscriptionId: "sub_test_1", trialEnd: 1_769_000_000 }, { type: "customer.subscription.trial_will_end" }));
		expect(await outboxEvent(h, "subscription.trial_will_end", `${record.id}:1769000000`)).toMatchObject({ data: { trialEnd: new Date(1_769_000_000_000).toISOString() } });
		const unknown = await h.deliver(event({ kind: "subscription_trial_will_end", subscriptionId: "sub_other", trialEnd: 1 }, { type: "customer.subscription.trial_will_end" }));
		expect(unknown.outcome).toBe("ignored");
	});

	it("serialises concurrent updates so the newest provider state wins", async () => {
		const h = createHarness();
		await h.deliver(subEvent(providerSubscription({ status: "active" }), 1000));
		await Promise.all([
			h.deliver(subEvent(providerSubscription({ status: "past_due" }), 2000)),
			h.deliver(subEvent(providerSubscription({ status: "unpaid" }), 3000)),
			h.deliver(subEvent(providerSubscription({ status: "incomplete" }), 1500)),
		]);
		expect((await recordOf(h))!).toMatchObject({ status: "unpaid", providerUpdatedAt: 3000 });
	});
});

describe("cancelSubscription", () => {
	const setup = async () => {
		const h = createHarness();
		h.provider.subscriptionsById.set("sub_test_1", providerSubscription());
		await h.deliver(subEvent(providerSubscription(), 1000));
		return { h, record: (await recordOf(h))! };
	};

	it("cancels at the period end with a stable idempotency key and publishes the change", async () => {
		const { h, record } = await setup();
		const result = await cancelSubscription(h.container, h.deps.publisher, { subscriptionId: record.id, atPeriodEnd: true });
		expect(result).toMatchObject({ cancelAtPeriodEnd: true, status: "active" });
		expect(h.provider.callsOf("cancelSubscription")[0]!.idempotencyKey).toBe(`stripe-commerce:subscription:cancel:${record.id}:true`);
		expect(await outboxEvent(h, "subscription.updated", `${record.id}:cancel:true`)).toMatchObject({ data: { cancelAtPeriodEnd: true } });
		// A webhook for the same change right after must still apply (the watermark did not move).
		await h.deliver(subEvent(providerSubscription({ cancelAtPeriodEnd: true }), 1001));
		expect((await recordOf(h))!.cancelAtPeriodEnd).toBe(true);
	});

	it("cancels immediately, and a repeat of an already canceled subscription changes nothing", async () => {
		const { h, record } = await setup();
		const canceled = await cancelSubscription(h.container, h.deps.publisher, { subscriptionId: record.id, atPeriodEnd: false });
		expect(canceled.status).toBe("canceled");
		expect(await outboxEvent(h, "subscription.canceled", record.id)).not.toBeNull();
		await cancelSubscription(h.container, h.deps.publisher, { subscriptionId: record.id, atPeriodEnd: false });
		expect(h.provider.callsOf("cancelSubscription")).toHaveLength(1);
	});

	it("rejects an unknown subscription", async () => {
		const h = createHarness();
		await expect(cancelSubscription(h.container, h.deps.publisher, { subscriptionId: "nope", atPeriodEnd: true })).rejects.toMatchObject({ kind: "notFound" });
	});
});

describe("subscription checkout settlement", () => {
	it("creates the subscription from a fresh retrieve, links the initial order and records the first invoice's payment", async () => {
		const h = createHarness();
		const seeded = await seedCheckout(h, { mode: "subscription" });
		h.provider.subscriptionsById.set(seeded.subscriptionId!, providerSubscription({ subscriptionId: seeded.subscriptionId!, items: [{ providerPriceId: seeded.providerPriceId, quantity: 2, description: null }], metadata: { emdash_checkout_id: seeded.checkoutId } }));
		const session = h.provider.sessions.get(seeded.sessionId)!.session;
		h.provider.invoices.set(session.invoiceId!, providerInvoice({ invoiceId: session.invoiceId!, subscriptionId: seeded.subscriptionId!, billingReason: "subscription_create", paymentIntentId: "pi_first", amountPaid: 5000 }));
		h.provider.paymentsById.set("pi_first", { paymentIntentId: "pi_first", status: "succeeded", amount: 5000, amountRefunded: 0, currency: "pln" as never, latestChargeId: "ch_first", methodType: "card", failureCode: null, failureMessage: null, metadata: {} });

		expect((await h.deliver(completeCheckout(h, seeded))).outcome).toBe("processed");
		const [order] = await allOrders(h);
		const record = (await recordOf(h, seeded.subscriptionId!))!;
		expect(order).toMatchObject({ paymentStatus: "paid", mode: "subscription", subscriptionId: record.id });
		expect(record).toMatchObject({ initialOrderId: order!.id, items: [expect.objectContaining({ priceId: seeded.priceId, title: "Shirt — Blue M", quantity: 2 })] });
		expect(await h.container.recordIndex.get(RECORD_INDEX_KEY.orderBySubscription(seeded.subscriptionId!))).toBe(order!.id);
		const paymentId = (await h.container.recordIndex.get(RECORD_INDEX_KEY.paymentByInvoice(session.invoiceId!)))!;
		expect(await h.container.payments.get(paymentId)).toMatchObject({ orderId: order!.id, subscriptionId: record.id, purpose: "checkout", stripe: { invoiceId: session.invoiceId } });
	});

	it("links the initial order to a subscription that an earlier event already created", async () => {
		const h = createHarness();
		const seeded = await seedCheckout(h, { mode: "subscription" });
		const sub = providerSubscription({ subscriptionId: seeded.subscriptionId!, metadata: { emdash_checkout_id: seeded.checkoutId } });
		h.provider.subscriptionsById.set(seeded.subscriptionId!, sub);
		await h.deliver(subEvent(sub, 1000, "customer.subscription.created"));
		expect(await recordOf(h, seeded.subscriptionId!)).toMatchObject({ initialOrderId: null, customerId: null });
		await h.deliver(completeCheckout(h, seeded));
		const [order] = await allOrders(h);
		expect(order!.customerId).not.toBeNull();
		// the customer is created by settlement, after the subscription event; a trial sends no later event to fill it in
		expect(await recordOf(h, seeded.subscriptionId!)).toMatchObject({ initialOrderId: order!.id, customerId: order!.customerId });
		expect(await h.container.subscriptions.get(order!.subscriptionId!)).not.toBeNull();
	});
});

describe("invoices", () => {
	const subscribed = async () => {
		const h = createHarness();
		h.provider.subscriptionsById.set("sub_test_1", providerSubscription());
		await h.deliver(subEvent(providerSubscription(), 1000));
		return { h, record: (await recordOf(h))! };
	};
	const paidInvoice = (h: Harness, over: Parameters<typeof providerInvoice>[0] = {}) => {
		const invoice = providerInvoice(over);
		h.provider.invoices.set(invoice.invoiceId, invoice);
		if (invoice.paymentIntentId) {
			h.provider.paymentsById.set(invoice.paymentIntentId, { paymentIntentId: invoice.paymentIntentId, status: "succeeded", amount: invoice.amountPaid, amountRefunded: 0, currency: "pln" as never, latestChargeId: invoice.chargeId, methodType: "card", failureCode: null, failureMessage: null, metadata: {} });
		}
		return invoice;
	};

	it("records a renewal payment once and announces invoice.paid once, however often the event arrives", async () => {
		const { h, record } = await subscribed();
		const invoice = paidInvoice(h);
		const invoiceEvent = () => event({ kind: "invoice_paid", invoice }, { type: "invoice.paid" });
		await Promise.all([h.deliver(invoiceEvent()), h.deliver(invoiceEvent()), h.deliver(invoiceEvent())]);
		const paymentId = (await h.container.recordIndex.get(RECORD_INDEX_KEY.paymentByInvoice(invoice.invoiceId)))!;
		expect(await h.container.payments.get(paymentId)).toMatchObject({ purpose: "subscription_renewal", subscriptionId: record.id, orderId: null, amount: 2500, status: "succeeded", stripe: { paymentIntentId: "pi_invoice_1", invoiceId: "in_test_1" } });
		expect(await h.container.recordIndex.get(RECORD_INDEX_KEY.paymentByPaymentIntent("pi_invoice_1"))).toBe(paymentId);
		expect(await outboxEvent(h, "invoice.paid", "in_test_1")).toMatchObject({ data: { subscriptionId: record.id, paymentId, amount: 2500 } });
	});

	it("creates the subscription from the provider when the invoice beats its events", async () => {
		const h = createHarness();
		h.provider.subscriptionsById.set("sub_test_1", providerSubscription());
		const invoice = paidInvoice(h);
		expect((await h.deliver(event({ kind: "invoice_paid", invoice }, { type: "invoice.paid" }))).outcome).toBe("processed");
		expect(await recordOf(h)).not.toBeNull();
	});

	it("ignores invoices that are not for a subscription of this store", async () => {
		const { h } = await subscribed();
		const oneOff = paidInvoice(h, { invoiceId: "in_oneoff", subscriptionId: null });
		expect((await h.deliver(event({ kind: "invoice_paid", invoice: oneOff }, { type: "invoice.paid" }))).outcome).toBe("ignored");
		h.provider.subscriptionsById.set("sub_foreign", providerSubscription({ subscriptionId: "sub_foreign", metadata: {} }));
		const foreign = paidInvoice(h, { invoiceId: "in_foreign", subscriptionId: "sub_foreign", paymentIntentId: "pi_foreign" });
		expect((await h.deliver(event({ kind: "invoice_paid", invoice: foreign }, { type: "invoice.paid" }))).outcome).toBe("ignored");
	});

	it("announces a failed payment per attempt and records no payment", async () => {
		const { h, record } = await subscribed();
		const failed = providerInvoice({ invoiceId: "in_fail", status: "open", paymentIntentId: null, amountPaid: 0, amountDue: 2500, attemptCount: 2 });
		h.provider.invoices.set("in_fail", failed);
		await h.deliver(event({ kind: "invoice_payment_failed", invoice: failed }, { type: "invoice.payment_failed" }));
		expect(await outboxEvent(h, "invoice.payment_failed", "in_fail:2")).toMatchObject({ data: { subscriptionId: record.id, amount: 2500, attemptCount: 2 } });
		expect(await h.container.recordIndex.get(RECORD_INDEX_KEY.paymentByInvoice("in_fail"))).toBeNull();
	});

	it("does not announce the checkout's own first invoice as a renewal", async () => {
		const { h } = await subscribed();
		const first = paidInvoice(h, { invoiceId: "in_first", billingReason: "subscription_create", paymentIntentId: "pi_first_inv" });
		await h.deliver(event({ kind: "invoice_paid", invoice: first }, { type: "invoice.paid" }));
		expect(await outboxEvent(h, "invoice.paid", "in_first")).toBeNull();
		const paymentId = (await h.container.recordIndex.get(RECORD_INDEX_KEY.paymentByInvoice("in_first")))!;
		expect((await h.container.payments.get(paymentId))!.purpose).toBe("checkout");
	});
});
