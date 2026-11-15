import { describe, expect, it } from "vitest";

import { RECORD_INDEX_KEY } from "../ports/repositories.js";
import { countOrderForCustomer, upsertCustomerFromCheckout, type CheckoutCustomerInput } from "./customers.js";
import { allOrders, completeCheckout, createHarness, event, paidOrder, seedCheckout } from "./payments/test-support.js";
import { processDueInbox } from "./webhook-inbox.js";

const checkout = (over: Partial<CheckoutCustomerInput> = {}): CheckoutCustomerInput => ({
	email: "Anna@Example.com",
	name: "Anna",
	phone: null,
	billingAddress: null,
	shippingAddress: null,
	providerCustomerId: "cus_anna",
	...over,
});

describe("upsertCustomerFromCheckout", () => {
	it("normalises the email and links both indexes", async () => {
		const h = createHarness();
		const { customer, isNew } = await upsertCustomerFromCheckout(h.container, checkout({ email: "  Anna@Example.COM " }));
		expect(isNew).toBe(true);
		expect(customer).toMatchObject({ email: "anna@example.com", stripeCustomerId: "cus_anna", orderCount: 0 });
		expect(await h.container.recordIndex.get(RECORD_INDEX_KEY.customerByEmail("anna@example.com"))).toBe(customer.id);
		expect(await h.container.recordIndex.get(RECORD_INDEX_KEY.customerByProviderId("cus_anna"))).toBe(customer.id);
	});

	it("creates one customer for many concurrent checkouts with the same email", async () => {
		const h = createHarness();
		const results = await Promise.all(Array.from({ length: 8 }, (_, index) => upsertCustomerFromCheckout(h.container, checkout({ providerCustomerId: `cus_${index}`, name: `Anna ${index}` }))));
		expect(new Set(results.map((result) => result.customer.id)).size).toBe(1);
		expect(results.filter((result) => result.isNew)).toHaveLength(1);
	});

	it("refreshes the profile without erasing known fields, and prefers a known Stripe customer over the email", async () => {
		const h = createHarness();
		const first = await upsertCustomerFromCheckout(h.container, checkout({ phone: "+48 111" }));
		const again = await upsertCustomerFromCheckout(h.container, checkout({ email: "other@example.com", name: "Anna K.", phone: null }));
		expect(again.isNew).toBe(false);
		expect(again.customer.id).toBe(first.customer.id);
		expect(again.customer).toMatchObject({ name: "Anna K.", phone: "+48 111", email: "anna@example.com" });
	});

	it("recovers when the indexed customer was deleted in the admin", async () => {
		const h = createHarness();
		const first = await upsertCustomerFromCheckout(h.container, checkout());
		await h.container.customers.get(first.customer.id);
		h.world.customers.get = async () => null;
		const second = await upsertCustomerFromCheckout(h.container, checkout());
		expect(second.isNew).toBe(true);
	});
});

describe("customer aggregates", () => {
	it("count an order once, however often settlement runs, and track first and last order", async () => {
		const h = createHarness();
		const { order } = await paidOrder(h, { email: "agg@example.com" });
		await Promise.all([countOrderForCustomer(h.container, order), countOrderForCustomer(h.container, order), countOrderForCustomer(h.container, order)]);
		await countOrderForCustomer(h.container, order);
		const customer = (await h.container.customers.get(order.customerId!))!;
		expect(customer).toMatchObject({ orderCount: 1, totalSpent: { pln: 5000 }, firstOrderAt: order.placedAt, lastOrderAt: order.placedAt });

		h.world.clock.advance(86_400_000);
		const second = await paidOrder(h, { email: "agg@example.com", quantity: 1 });
		const after = (await h.container.customers.get(order.customerId!))!;
		expect(second.order.customerId).toBe(order.customerId);
		expect(after).toMatchObject({ orderCount: 2, totalSpent: { pln: 7500 }, firstOrderAt: order.placedAt, lastOrderAt: second.order.placedAt });
	});

	it("counts the order on retry when the aggregate write failed the first time", async () => {
		const h = createHarness();
		const seeded = await seedCheckout(h);
		const realUpdate = h.container.customers.update.bind(h.container.customers);
		let shouldFail = true;
		h.container.customers.update = async (id, patch) => {
			if (shouldFail && "orderCount" in patch) {
				shouldFail = false;
				throw new Error("write failed");
			}
			return realUpdate(id, patch);
		};
		expect((await h.deliver(completeCheckout(h, seeded))).outcome).toBe("failed");
		h.world.clock.advance(3_600_000);
		expect((await processDueInbox(h.container, 10)).processed).toBe(1);
		const [order] = await allOrders(h);
		expect((await h.container.customers.get(order!.customerId!))!.orderCount).toBe(1);
	});
});

describe("customer webhooks", () => {
	it("updates the profile of a known customer and announces it", async () => {
		const h = createHarness();
		const { order, seeded } = await paidOrder(h);
		const stripeId = h.provider.sessions.get(seeded.sessionId)!.session.providerCustomerId!;
		const result = await h.deliver(
			event({ kind: "customer_updated", customer: { providerCustomerId: stripeId, email: "buyer@example.com", name: "New Name", phone: "+48 222", billingAddress: null, shippingAddress: { line1: "Ul. 1", line2: null, city: "Kraków", postalCode: "30-001", state: null, country: "PL" }, isDeleted: false } }, { type: "customer.updated", eventId: "evt_cu1" }),
		);
		expect(result.outcome).toBe("processed");
		expect(await h.container.customers.get(order.customerId!)).toMatchObject({ name: "New Name", phone: "+48 222", shippingAddress: { city: "Kraków" } });
		expect(await h.container.outbox.get(`customer.updated:${order.customerId}:evt_cu1`)).not.toBeNull();
	});

	it("clears the Stripe customer id when it is deleted there", async () => {
		const h = createHarness();
		const { order, seeded } = await paidOrder(h);
		const stripeId = h.provider.sessions.get(seeded.sessionId)!.session.providerCustomerId!;
		await h.deliver(event({ kind: "customer_updated", customer: { providerCustomerId: stripeId, email: null, name: null, phone: null, billingAddress: null, shippingAddress: null, isDeleted: true } }, { type: "customer.deleted" }));
		expect((await h.container.customers.get(order.customerId!))!.stripeCustomerId).toBeNull();
		expect(await h.container.recordIndex.get(RECORD_INDEX_KEY.customerByProviderId(stripeId))).toBe("");
	});

	it("ignores customers we do not know, and another Stripe customer with a known email", async () => {
		const h = createHarness();
		const { order } = await paidOrder(h);
		const unknown = await h.deliver(event({ kind: "customer_updated", customer: { providerCustomerId: "cus_nobody", email: "nobody@example.com", name: "X", phone: null, billingAddress: null, shippingAddress: null, isDeleted: false } }, { type: "customer.created" }));
		expect(unknown.outcome).toBe("ignored");
		const sameEmail = await h.deliver(event({ kind: "customer_updated", customer: { providerCustomerId: "cus_second", email: "buyer@example.com", name: "Hijack", phone: null, billingAddress: null, shippingAddress: null, isDeleted: false } }, { type: "customer.created" }));
		expect(sameEmail.outcome).toBe("ignored");
		expect((await h.container.customers.get(order.customerId!))!.name).toBe("Test Buyer");
	});
});
