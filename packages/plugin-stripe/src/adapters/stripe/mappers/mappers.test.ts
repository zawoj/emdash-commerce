import type Stripe from "stripe";
import { describe, expect, it } from "vitest";

import { loadStripeEvent, loadStripeObject } from "../../../testing/fixtures/stripe/index.js";
import { ProviderError } from "../../../ports/payment-provider.js";
import { toPriceSnapshot, toProductSnapshot } from "./catalog-snapshots.js";
import { addressOf, idOf, metadataOf } from "./common.js";
import { toProviderCustomer } from "./customer.js";
import { disputeStatusOf, paymentStatusOf, toProviderDispute, toProviderPayment, toProviderRefund } from "./payment.js";
import { toCheckoutSessionResult, toProviderCheckoutSession } from "./session.js";
import { toProviderInvoice, toProviderSubscription } from "./subscription.js";

const object = <T>(type: Parameters<typeof loadStripeEvent>[0]): T => loadStripeEvent(type).data.object as unknown as T;

describe("common helpers", () => {
	it("reads ids from strings, expanded objects and null", () => {
		expect(idOf("cus_1")).toBe("cus_1");
		expect(idOf({ id: "cus_2" })).toBe("cus_2");
		expect(idOf(null)).toBeNull();
		expect(idOf(undefined)).toBeNull();
	});

	it("keeps only string metadata values", () => {
		expect(metadataOf({ a: "1" })).toEqual({ a: "1" });
		expect(metadataOf(null)).toEqual({});
	});

	it("maps an address to camelCase and null-fills missing parts", () => {
		expect(addressOf({ line1: "1 St", city: "Warsaw", country: "PL", postal_code: "00-001", line2: null, state: null })).toEqual({
			line1: "1 St",
			line2: null,
			city: "Warsaw",
			postalCode: "00-001",
			state: null,
			country: "PL",
		});
		expect(addressOf(null)).toBeNull();
	});
});

describe("toProviderCheckoutSession", () => {
	it("maps a completed payment session with expanded line items", () => {
		const session = toProviderCheckoutSession(loadStripeObject<Stripe.Checkout.Session>("checkoutSession"));
		expect(session).toMatchObject({
			status: "complete",
			paymentStatus: "paid",
			mode: "payment",
			isLivemode: false,
			currency: "pln",
			amountSubtotal: 360,
			amountDiscount: 0,
			amountTax: 0,
			amountShipping: 0,
			amountTotal: 360,
			email: "buyer@example.com",
			name: "Test Buyer",
			subscriptionId: null,
			invoiceId: null,
		});
		expect(session.paymentIntentId).toMatch(/^pi_/);
		expect(session.providerCustomerId).toMatch(/^cus_/);
		expect(session.metadata).toEqual({ cart_id: expect.any(String) });
		expect(session.lines).toEqual([
			expect.objectContaining({ providerPriceId: expect.stringMatching(/^price_/), quantity: 3, amountTotal: 360, currency: "pln" }),
		]);
	});

	it("takes shipping before tax and discounts, and the shipping address from collected information", () => {
		const session = toProviderCheckoutSession(loadStripeObject<Stripe.Checkout.Session>("checkoutSessionShipping"));
		expect(session.amountShipping).toBe(500);
		expect(session.amountDiscount).toBe(36);
		expect(session.amountTax).toBe(115);
		// total = subtotal - discount + shipping + tax
		expect(session.amountTotal).toBe(session.amountSubtotal - session.amountDiscount + session.amountShipping + session.amountTax);
		expect(session.shippingAddress).toMatchObject({ line1: "2 Ship Street", city: "Krakow", country: "PL" });
		expect(session.billingAddress).toMatchObject({ line1: "1 Example Street", country: "PL" });
		expect(session.lines[0]).toMatchObject({ amountDiscount: 36, amountTax: 22 });
	});

	it("returns no lines when line_items was not expanded", () => {
		const raw = loadStripeObject<Stripe.Checkout.Session>("checkoutSession");
		delete raw.line_items;
		expect(toProviderCheckoutSession(raw).lines).toEqual([]);
	});

	it("rejects a setup-mode session", () => {
		const raw = { ...loadStripeObject<Stripe.Checkout.Session>("checkoutSession"), mode: "setup" as const };
		expect(() => toProviderCheckoutSession(raw)).toThrow(ProviderError);
	});

	it("treats an unknown status as open and unpaid", () => {
		const raw = { ...loadStripeObject<Stripe.Checkout.Session>("checkoutSession"), status: "weird", payment_status: "weird" };
		expect(toProviderCheckoutSession(raw)).toMatchObject({ status: "open", paymentStatus: "unpaid" });
	});

	it("maps a hosted result and an embedded result", () => {
		const base = loadStripeObject<Stripe.Checkout.Session>("checkoutSession");
		expect(toCheckoutSessionResult({ ...base, url: "https://checkout.example/x", client_secret: null, expires_at: 1_800_000_000 })).toEqual({
			sessionId: base.id,
			url: "https://checkout.example/x",
			clientSecret: null,
			expiresAt: "2027-01-15T08:00:00.000Z",
		});
		expect(toCheckoutSessionResult({ ...base, url: null, client_secret: "cs_secret", expires_at: 1_800_000_000 })).toMatchObject({
			url: null,
			clientSecret: "cs_secret",
		});
	});
});

describe("payments", () => {
	it("maps an expanded PaymentIntent with its charge", () => {
		const payment = toProviderPayment(loadStripeObject<Stripe.PaymentIntent>("paymentIntent"));
		expect(payment).toMatchObject({
			status: "succeeded",
			amount: 1500,
			amountRefunded: 0,
			currency: "usd",
			methodType: "card",
			failureCode: null,
		});
		expect(payment.latestChargeId).toMatch(/^ch_/);
	});

	it("maps the PaymentIntent statuses", () => {
		const base = loadStripeObject<Stripe.PaymentIntent>("paymentIntent");
		const status = (value: string, withError = false) =>
			paymentStatusOf({ ...base, status: value, last_payment_error: withError ? ({ code: "card_declined" } as Stripe.PaymentIntent.LastPaymentError) : null } as Stripe.PaymentIntent);
		expect(status("succeeded")).toBe("succeeded");
		expect(status("canceled")).toBe("canceled");
		expect(status("processing")).toBe("processing");
		expect(status("requires_action")).toBe("requires_action");
		expect(status("requires_confirmation")).toBe("requires_action");
		expect(status("requires_payment_method", true)).toBe("failed");
		expect(status("requires_payment_method", false)).toBe("requires_action");
	});

	it("reads the failure of a failed intent", () => {
		const payment = toProviderPayment(object<Stripe.PaymentIntent>("payment_intent.payment_failed"), { forceFailed: true });
		expect(payment.status).toBe("failed");
		expect(payment.failureCode).toEqual(expect.any(String));
		expect(payment.failureMessage).toEqual(expect.any(String));
	});

	it("reports refunded amount from the expanded charge", () => {
		const base = loadStripeObject<Stripe.PaymentIntent>("paymentIntent");
		const charge = { ...(base.latest_charge as Stripe.Charge), amount_refunded: 500 };
		expect(toProviderPayment({ ...base, latest_charge: charge }).amountRefunded).toBe(500);
	});

	it("echoes our refund record id from metadata, and null for a dashboard refund", () => {
		const refund = object<Stripe.Refund>("refund.created");
		expect(toProviderRefund(refund)).toMatchObject({
			refundId: refund.id,
			amount: 500,
			status: "succeeded",
			reason: "requested_by_customer",
			refundRecordId: "rf_fixture",
		});
		expect(toProviderRefund({ ...refund, metadata: {} }).refundRecordId).toBeNull();
	});

	it("maps refund statuses, treating a missing one as pending", () => {
		const refund = object<Stripe.Refund>("refund.created");
		expect(toProviderRefund({ ...refund, status: "failed" }).status).toBe("failed");
		expect(toProviderRefund({ ...refund, status: "requires_action" }).status).toBe("requires_action");
		expect(toProviderRefund({ ...refund, status: null }).status).toBe("pending");
	});
});

describe("disputes", () => {
	it.each([
		["needs_response", "open"],
		["under_review", "open"],
		["warning_needs_response", "open"],
		["warning_under_review", "open"],
		["appeal_needs_response", "open"],
		["won", "won"],
		["lost", "lost"],
		["prevented", "won"],
		["warning_closed", "won"],
	] as const)("%s -> %s", (status, expected) => {
		expect(disputeStatusOf(status)).toBe(expected);
	});

	it("maps a dispute object", () => {
		const dispute = toProviderDispute(object<Stripe.Dispute>("charge.dispute.created"));
		expect(dispute).toMatchObject({ amount: 1500, currency: "eur", status: "open" });
		expect(dispute.chargeId).toMatch(/^ch_/);
		expect(dispute.paymentIntentId).toMatch(/^pi_/);
	});
});

describe("customers", () => {
	it("maps a live customer", () => {
		const customer = toProviderCustomer({
			...object<Stripe.Customer>("customer.created"),
			email: "a@example.com",
			name: "A",
			address: { line1: "1 St", line2: null, city: "W", postal_code: "1", state: null, country: "PL" },
			shipping: { name: "A", address: { line1: "2 St", line2: null, city: "K", postal_code: "2", state: null, country: "PL" } },
		});
		expect(customer).toMatchObject({ email: "a@example.com", name: "A", isDeleted: false });
		expect(customer.billingAddress?.line1).toBe("1 St");
		expect(customer.shippingAddress?.line1).toBe("2 St");
	});

	it("maps a deleted customer", () => {
		expect(toProviderCustomer({ id: "cus_1", object: "customer", deleted: true })).toMatchObject({
			providerCustomerId: "cus_1",
			isDeleted: true,
			email: null,
		});
	});
});

describe("subscriptions and invoices", () => {
	it("reads the billing period from the subscription items (API 2026-10-28)", () => {
		const raw = loadStripeObject<Stripe.Subscription>("subscription");
		const subscription = toProviderSubscription(raw);
		expect(subscription).toMatchObject({
			subscriptionId: raw.id,
			status: "canceled",
			interval: "month",
			intervalCount: 1,
			currency: "usd",
			cancelAtPeriodEnd: false,
		});
		expect(subscription.currentPeriodStart).toBe(raw.items.data[0]?.current_period_start);
		expect(subscription.currentPeriodEnd).toBe(raw.items.data[0]?.current_period_end);
		expect(subscription.items).toEqual([expect.objectContaining({ providerPriceId: expect.stringMatching(/^price_/), quantity: 1 })]);
		expect(subscription.amount).toBe(raw.items.data[0]?.price.unit_amount);
		expect(subscription.latestInvoiceId).toMatch(/^in_/);
	});

	it("falls back to period fields on an older payload shape", () => {
		const raw = loadStripeObject<Stripe.Subscription>("subscription");
		const item = { ...raw.items.data[0], current_period_start: undefined, current_period_end: undefined } as unknown as Stripe.SubscriptionItem;
		const legacy = { ...raw, items: { ...raw.items, data: [item] }, current_period_start: 100, current_period_end: 200 };
		expect(toProviderSubscription(legacy)).toMatchObject({ currentPeriodStart: 100, currentPeriodEnd: 200 });
	});

	it("treats an unknown status as not entitled", () => {
		const raw = { ...loadStripeObject<Stripe.Subscription>("subscription"), status: "brand_new" };
		expect(toProviderSubscription(raw).status).toBe("incomplete");
	});

	it("rejects a subscription without a recurring item", () => {
		const raw = loadStripeObject<Stripe.Subscription>("subscription");
		expect(() => toProviderSubscription({ ...raw, items: { ...raw.items, data: [] } })).toThrow(ProviderError);
	});

	it("finds the PaymentIntent and charge through invoice payments", () => {
		const invoice = toProviderInvoice(loadStripeObject<Stripe.Invoice>("invoiceSubscription"));
		expect(invoice).toMatchObject({ status: "paid", amountPaid: 1500, currency: "usd", billingReason: "subscription_create" });
		expect(invoice.subscriptionId).toMatch(/^sub_/);
		expect(invoice.paymentIntentId).toMatch(/^pi_/);
		expect(invoice.chargeId).toMatch(/^ch_/);
		expect(invoice.providerCustomerId).toMatch(/^cus_/);
	});

	it("has no payment links when payments are not expanded (event snapshot)", () => {
		const invoice = toProviderInvoice(object<Stripe.Invoice>("invoice.paid"));
		expect(invoice.paymentIntentId).toBeNull();
		expect(invoice.chargeId).toBeNull();
		expect(invoice.status).toBe("paid");
	});

	it("keeps the intent id when the payment is not expanded further", () => {
		const raw = loadStripeObject<Stripe.Invoice>("invoiceSubscription");
		const payment = raw.payments?.data[0] as Stripe.InvoicePayment;
		const intentId = (payment.payment.payment_intent as Stripe.PaymentIntent).id;
		const shallow = { ...raw, payments: { ...raw.payments, data: [{ ...payment, payment: { type: "payment_intent", payment_intent: intentId } }] } } as Stripe.Invoice;
		expect(toProviderInvoice(shallow)).toMatchObject({ paymentIntentId: intentId, chargeId: null });
	});
});

describe("catalog snapshots", () => {
	it("maps a product and reads the entity key from metadata", () => {
		const raw = object<Stripe.Product>("product.created");
		expect(toProductSnapshot({ ...raw, metadata: { emdash_entity: "product:42" } })).toMatchObject({
			providerId: raw.id,
			name: raw.name,
			isActive: true,
			entityKey: "product:42",
			updatedAt: raw.updated,
		});
		expect(toProductSnapshot(raw).entityKey).toBeNull();
	});

	it("marks a deleted product and price inactive", () => {
		expect(toProductSnapshot(object<Stripe.Product>("product.deleted"), { isDeleted: true }).isActive).toBe(false);
		expect(toPriceSnapshot(object<Stripe.Price>("price.created"), { isDeleted: true }).isActive).toBe(false);
	});

	it("maps a price", () => {
		const raw = object<Stripe.Price>("price.created");
		expect(toPriceSnapshot({ ...raw, metadata: { emdash_entity: "price:7" } })).toMatchObject({
			providerId: raw.id,
			unitAmount: raw.unit_amount,
			isActive: true,
			entityKey: "price:7",
		});
		expect(toPriceSnapshot(raw).providerProductId).toMatch(/^prod_/);
	});
});
