import { describe, expect, it } from "vitest";

import { RECORD_INDEX_KEY } from "../ports/repositories.js";
import type { ProviderPayment } from "../ports/payment-provider.js";
import { completeCheckout, createHarness, event, paidOrder, pln, seedCheckout } from "./payments/test-support.js";

const intent = (over: Partial<ProviderPayment> = {}): ProviderPayment => ({
	paymentIntentId: "pi_events_1",
	status: "succeeded",
	amount: 5000,
	amountRefunded: 0,
	currency: pln,
	latestChargeId: "ch_events_1",
	methodType: "card",
	failureCode: null,
	failureMessage: null,
	metadata: { emdash_checkout_id: "co_x" },
	...over,
});

const paymentEvent = (payment: ProviderPayment, type = "payment_intent.succeeded") => event({ kind: "payment_updated", payment }, { type });

describe("payment events", () => {
	it("records a payment intent of ours that settlement has not reached yet", async () => {
		const h = createHarness();
		await h.deliver(paymentEvent(intent({ paymentIntentId: "pi_early", status: "processing", methodType: "blik" }), "payment_intent.processing"));
		const paymentId = (await h.container.recordIndex.get(RECORD_INDEX_KEY.paymentByPaymentIntent("pi_early")))!;
		expect(await h.container.payments.get(paymentId)).toMatchObject({ orderId: null, status: "processing", methodType: "blik", purpose: "checkout" });
		expect(h.provider.callsOf("retrievePayment")).toHaveLength(1);
		expect(await h.container.recordIndex.get(RECORD_INDEX_KEY.paymentByCharge("ch_events_1"))).toBe(paymentId);
	});

	it("keeps one record per payment intent and takes the provider's current state, not a stale event", async () => {
		const h = createHarness();
		const { order, seeded } = await paidOrder(h);
		const paymentId = (await h.container.recordIndex.get(RECORD_INDEX_KEY.paymentByPaymentIntent(seeded.paymentIntentId!)))!;
		// A late "processing" event; the provider says it succeeded.
		const stale = intent({ paymentIntentId: seeded.paymentIntentId!, status: "processing", amount: 5000 });
		await h.deliver(paymentEvent(stale, "payment_intent.processing"));
		expect(await h.container.payments.get(paymentId)).toMatchObject({ status: "succeeded", orderId: order.id });
	});

	it("never un-pays a payment from an event snapshot when the provider cannot be asked", async () => {
		const h = createHarness();
		const { seeded } = await paidOrder(h);
		const paymentId = (await h.container.recordIndex.get(RECORD_INDEX_KEY.paymentByPaymentIntent(seeded.paymentIntentId!)))!;
		h.provider.paymentsById.delete(seeded.paymentIntentId!);
		await h.deliver(paymentEvent(intent({ paymentIntentId: seeded.paymentIntentId!, status: "processing" }), "payment_intent.processing"));
		expect((await h.container.payments.get(paymentId))!.status).toBe("succeeded");
	});

	it("projects the cumulative refunded amount and failure details", async () => {
		const h = createHarness();
		await h.deliver(paymentEvent(intent({ paymentIntentId: "pi_fail", status: "failed", failureCode: "card_declined", failureMessage: "Declined" }), "payment_intent.payment_failed"));
		const id = (await h.container.recordIndex.get(RECORD_INDEX_KEY.paymentByPaymentIntent("pi_fail")))!;
		expect(await h.container.payments.get(id)).toMatchObject({ status: "failed", failureCode: "card_declined", failureMessage: "Declined" });
		h.provider.paymentsById.set("pi_fail", intent({ paymentIntentId: "pi_fail", status: "succeeded", amountRefunded: 700 }));
		await h.deliver(paymentEvent(intent({ paymentIntentId: "pi_fail" })));
		expect(await h.container.payments.get(id)).toMatchObject({ status: "succeeded", failureCode: null, amountRefunded: 700 });
	});

	it("ignores payment intents this plugin did not create", async () => {
		const h = createHarness();
		const result = await h.deliver(paymentEvent(intent({ paymentIntentId: "pi_foreign", metadata: {} })));
		expect(result.outcome).toBe("ignored");
		expect(await h.container.recordIndex.get(RECORD_INDEX_KEY.paymentByPaymentIntent("pi_foreign"))).toBeNull();
		expect(h.provider.callsOf("retrievePayment")).toHaveLength(0);
	});

	it("creates the payment once when the intent event and settlement race", async () => {
		const h = createHarness();
		const seeded = await seedCheckout(h);
		const completed = completeCheckout(h, seeded);
		const payment = h.provider.paymentsById.get(seeded.paymentIntentId!)!;
		await Promise.all([h.deliver(completed), h.deliver(paymentEvent({ ...payment, metadata: { emdash_checkout_id: seeded.checkoutId } }))]);
		const id = (await h.container.recordIndex.get(RECORD_INDEX_KEY.paymentByPaymentIntent(seeded.paymentIntentId!)))!;
		const record = (await h.container.payments.get(id))!;
		expect(record.orderId).not.toBeNull();
		expect(record.status).toBe("succeeded");
	});
});
