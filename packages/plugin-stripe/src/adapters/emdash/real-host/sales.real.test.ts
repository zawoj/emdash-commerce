import { SchemaRegistry, createContentAccessWithWrite } from "emdash";
import { describe, expect, it } from "vitest";

import { commerceOptionsSchema } from "../../../contracts/options.js";
import { toCurrencyCode } from "../../../core/money.js";
import { ORDER_LIFECYCLE_STATUS, ORDER_PAYMENT_STATUS, type Order } from "../../../core/order.js";
import { ORDER_ACTOR_KIND, ORDER_TIMELINE_TYPE } from "../../../core/order-timeline.js";
import { PAYMENT_PURPOSE, PAYMENT_STATUS } from "../../../core/payment.js";
import type { CommerceContainer } from "../../../plugin/container.js";
import { recordOrderEvent } from "../../../services/order-events.js";
import { createFixedClock, createNullLogger } from "../../../testing/clock.js";
import { createInMemoryRecordIndex } from "../../../testing/in-memory/record-index.js";
import { createFakeKv } from "../../../testing/fakes/storage.js";
import { requireWritableContent } from "../content/repositories.js";
import { createCustomerRepository, createOrderRepository, createPaymentRepository, createSubscriptionRepository } from "../content/sales-repositories.js";
import { createEmDashRelations } from "../relations/emdash-relations.js";
import { buildSchemaDefinitions } from "../schema/collections/index.js";
import { ORDER_FIELD, SALES_RELATION } from "../schema/field-names.js";
import { reconcileSchema } from "../schema/reconcile.js";
import { createRegistryPortFor } from "../schema/registry-port.js";
import { createRealDatabase } from "./host.js";

/**
 * The order, payment, subscription, customer and timeline repositories on EmDash's own content access, relations
 * handlers and SQLite: the schema comes from the reconciler (so relation-bound fields are real), the links are real
 * edges, and the indexed scalar queries run as the SQL the host builds.
 */

const options = commerceOptionsSchema.parse({ supportedCurrencies: ["pln", "eur"] });
const slugs = options.collections;
const definitions = buildSchemaDefinitions(options);
const log = createNullLogger();
const pln = toCurrencyCode("pln");

const db = await createRealDatabase();
const registry = new SchemaRegistry(db as never);
const port = createRegistryPortFor(db as never);
await reconcileSchema(port, definitions);

const rawContent = createContentAccessWithWrite(db as never);
const content = requireWritableContent(rawContent);
const relations = createEmDashRelations(async () => db as never);
const kv = createFakeKv();
const orders = createOrderRepository(content, slugs, { relations, kv });
const payments = createPaymentRepository(content, slugs, { relations });
const subscriptions = createSubscriptionRepository(content, slugs, { relations });
const customers = createCustomerRepository(content, slugs, log);

let counter = 0;
const sampleOrder = (over: Partial<Omit<Order, "id">> = {}): Omit<Order, "id"> => {
	counter += 1;
	return {
		orderNumber: `ORD-2026-${String(counter).padStart(5, "0")}`,
		orderStatus: ORDER_LIFECYCLE_STATUS.open,
		paymentStatus: ORDER_PAYMENT_STATUS.paid,
		statusBeforeDispute: null,
		fulfillmentStatus: "unfulfilled",
		mode: "payment",
		customerId: null,
		email: "buyer@example.com",
		customerName: "Ann Buyer",
		phone: null,
		billingAddress: { line1: "1 Main St", line2: null, city: "Warsaw", postalCode: "00-001", state: null, country: "PL" },
		shippingAddress: null,
		lines: [
			{
				priceId: "pr1",
				productId: "p1",
				variantId: "v1",
				title: "Shirt",
				variantTitle: "Shirt - M / Black",
				sku: "SHIRT-M-BLK",
				optionsText: "Size: M, Colour: Black",
				quantity: 2,
				unitAmount: 1000,
				amountSubtotal: 2000,
				discountAmount: 200,
				taxAmount: 414,
				amountTotal: 2214,
				priceType: "one_time",
				stripePriceId: "price_1",
			},
			{ priceId: "pr2", productId: "p2", variantId: null, title: "Mug", variantTitle: null, sku: null, optionsText: null, quantity: 1, unitAmount: 500, amountSubtotal: 500, discountAmount: 0, taxAmount: 0, amountTotal: 500, priceType: "recurring", stripePriceId: "price_2" },
		],
		totals: { subtotal: 2500, discount: 200, tax: 414, shipping: 500, total: 3214, refunded: 0, currency: pln },
		reviewFlags: ["amount_mismatch"],
		cartId: "c".repeat(32),
		subscriptionId: null,
		stripe: { checkoutSessionId: `cs_${counter}_${Math.random().toString(36).slice(2, 10)}`, paymentIntentId: "pi_1", customerId: "cus_1", subscriptionId: null, invoiceId: null, isLivemode: false },
		placedAt: "2026-01-15T12:00:00.000Z",
		paidAt: "2026-01-15T12:01:00.000Z",
		...over,
	};
};

const sampleCustomer = (email: string) => ({ email, name: "Ann", phone: null, billingAddress: null, shippingAddress: null, stripeCustomerId: "cus_1", orderCount: 0, totalSpent: {}, firstOrderAt: null, lastOrderAt: null });

const samplePayment = (over: Record<string, unknown> = {}) => {
	counter += 1;
	return {
		orderId: null as string | null,
		subscriptionId: null as string | null,
		purpose: PAYMENT_PURPOSE.checkout,
		status: PAYMENT_STATUS.succeeded,
		amount: 2500,
		amountRefunded: 0,
		currency: pln,
		methodType: "card",
		failureCode: null,
		failureMessage: null,
		stripe: { paymentIntentId: `pi_${counter}`, chargeId: `ch_${counter}`, invoiceId: null },
		createdAt: "2026-01-15T12:01:00.000Z",
		updatedAt: "2026-01-15T12:01:00.000Z",
		...over,
	};
};

const sampleSubscription = (over: Record<string, unknown> = {}) => {
	counter += 1;
	return {
		customerId: null as string | null,
		initialOrderId: null as string | null,
		status: "active" as const,
		items: [{ priceId: "pr1", productId: "p1", variantId: null, title: "Plan", quantity: 1, stripePriceId: "price_1" }],
		interval: "month" as const,
		intervalCount: 1,
		currency: pln,
		amount: 900,
		currentPeriodStart: null,
		currentPeriodEnd: "2026-02-15T00:00:00.000Z",
		trialEnd: null,
		cancelAtPeriodEnd: false,
		canceledAt: null,
		stripe: { subscriptionId: `sub_${counter}`, customerId: "cus_1", latestInvoiceId: null },
		providerUpdatedAt: 1_700_000_000,
		...over,
	};
};

describe("orders on real columns and relations", () => {
	it("round-trips an order with the repeater snapshot and the customer relation", async () => {
		const customer = await customers.create(sampleCustomer("round@example.com"));
		const input = sampleOrder({ customerId: customer.id });
		const created = await orders.create(input);
		expect(created).toEqual({ id: created.id, ...input });
		expect(await orders.get(created.id)).toEqual(created);
		// The same edge is visible from the customer's side (what an editor sees on the customer).
		const fromCustomer = await relations.children(slugs.customers, customer.id, "orders", { includeDrafts: true });
		expect(fromCustomer.items.map((entry) => entry.id)).toEqual([created.id]);
	});

	it("keeps a published order readable, with lifecycle and payment status as separate indexed columns", async () => {
		const created = await orders.create(sampleOrder({ paymentStatus: ORDER_PAYMENT_STATUS.pending }));
		expect((await rawContent.get(slugs.orders, created.id))?.status).toBe("published");
		const updated = await orders.update(created.id, { orderStatus: ORDER_LIFECYCLE_STATUS.completed, paymentStatus: ORDER_PAYMENT_STATUS.disputed, statusBeforeDispute: ORDER_PAYMENT_STATUS.paid, paidAt: null });
		expect(updated).toMatchObject({ orderStatus: "completed", paymentStatus: "disputed", statusBeforeDispute: "paid", paidAt: null, lines: created.lines });
		const disputed = await orders.list({ status: ORDER_PAYMENT_STATUS.disputed, cursor: null, limit: 50 });
		expect(disputed.items.map((order) => order.id)).toContain(created.id);
		const completed = await orders.list({ orderStatus: ORDER_LIFECYCLE_STATUS.completed, cursor: null, limit: 50 });
		expect(completed.items.every((order) => order.orderStatus === "completed")).toBe(true);
		expect(completed.items.map((order) => order.id)).toContain(created.id);
	});

	it("moves and clears the customer link through the relation", async () => {
		const first = await customers.create(sampleCustomer("one@example.com"));
		const second = await customers.create(sampleCustomer("two@example.com"));
		const created = await orders.create(sampleOrder({ customerId: first.id }));
		expect((await orders.update(created.id, { customerId: second.id })).customerId).toBe(second.id);
		expect((await relations.children(slugs.customers, first.id, "orders", { includeDrafts: true })).items).toEqual([]);
		expect((await orders.update(created.id, { customerId: null })).customerId).toBeNull();
	});

	it("lists newest first by the indexed placed_at column and pages by cursor", async () => {
		for (let day = 1; day <= 3; day += 1) await orders.create(sampleOrder({ placedAt: `2030-02-0${day}T00:00:00.000Z` }));
		const first = await orders.list({ cursor: null, limit: 2 });
		expect(first.items.map((order) => order.placedAt)).toEqual(["2030-02-03T00:00:00.000Z", "2030-02-02T00:00:00.000Z"]);
		expect((await orders.list({ cursor: first.cursor, limit: 2 })).items[0]!.placedAt).toBe("2030-02-01T00:00:00.000Z");
	});

	it("finds an order by its checkout session through the indexed column", async () => {
		const created = await orders.create(sampleOrder());
		expect((await orders.findByCheckoutSession(created.stripe.checkoutSessionId))?.id).toBe(created.id);
		expect(await orders.findByCheckoutSession("cs_nope")).toBeNull();
	});

	it("adds a missing field to a collection that already holds rows without backfilling a required value", async () => {
		const created = await orders.create(sampleOrder());
		await registry.deleteField(slugs.orders, "paid_at");
		await reconcileSchema(port, definitions);
		expect((await orders.get(created.id))?.paidAt).toBeNull();
	});

	it("refuses to read an order whose bounded link set outgrew one relation page (51 subscriptions)", async () => {
		const order = await orders.create(sampleOrder());
		for (let index = 0; index < 51; index += 1) await subscriptions.create(sampleSubscription({ initialOrderId: order.id }));
		await expect(orders.get(order.id)).rejects.toMatchObject({ name: "CommerceError", kind: "internal" });
	});
});

describe("payments and subscriptions on real relations", () => {
	it("links a payment to its order and subscription, and lists payments through the indexed order id", async () => {
		const order = await orders.create(sampleOrder());
		const subscription = await subscriptions.create(sampleSubscription({ initialOrderId: order.id }));
		const input = samplePayment({ orderId: order.id, subscriptionId: subscription.id });
		const created = await payments.create(input);
		const other = await orders.create(sampleOrder());
		await payments.create(samplePayment({ orderId: other.id }));
		expect(created).toEqual({ id: created.id, ...input });
		expect((await payments.listByOrder(order.id)).map((payment) => payment.id)).toEqual([created.id]);
		expect((await relations.children(slugs.orders, order.id, ORDER_FIELD.payments, { includeDrafts: true })).items.map((entry) => entry.id)).toEqual([created.id]);
		expect((await relations.children(slugs.subscriptions, subscription.id, "payments", { includeDrafts: true })).items.map((entry) => entry.id)).toEqual([created.id]);
	});

	it("round-trips a subscription with customer and initial order, readable from the order", async () => {
		const customer = await customers.create(sampleCustomer("sub@example.com"));
		const order = await orders.create(sampleOrder());
		const input = sampleSubscription({ customerId: customer.id, initialOrderId: order.id });
		const created = await subscriptions.create(input);
		expect(created).toEqual({ id: created.id, ...input });
		expect(await subscriptions.get(created.id)).toEqual(created);
		expect((await orders.get(order.id))?.subscriptionId).toBe(created.id);
		expect((await relations.children(slugs.customers, customer.id, "subscriptions", { includeDrafts: true })).items.map((entry) => entry.id)).toEqual([created.id]);
		expect(SALES_RELATION.subscriptionInitialOrder).toBe("subscription_initial_order");
	});
});

describe("order timeline on real SQLite", () => {
	const event = (orderId: string, over: Record<string, unknown> = {}) => ({
		orderId,
		type: ORDER_TIMELINE_TYPE.note,
		message: "Packed",
		actorKind: ORDER_ACTOR_KIND.admin,
		actorLabel: "a@b.c",
		data: { weight: 2 },
		occurredAt: "2026-01-15T12:00:00.000Z",
		sourceKey: `key-${Math.random().toString(36).slice(2)}`,
		...over,
	});

	it("stores an entry linked to its order and reads it back newest first", async () => {
		const order = await orders.create(sampleOrder());
		await orders.events.create(event(order.id, { message: "first", occurredAt: "2026-01-15T12:00:01.000Z" }));
		const second = await orders.events.create(event(order.id, { message: "second", occurredAt: "2026-01-15T12:00:02.000Z" }));
		const listed = await orders.events.listByOrder(order.id, { cursor: null, limit: 10 });
		expect(listed.items.map((item) => item.message)).toEqual(["second", "first"]);
		expect(listed.items[0]).toMatchObject({ id: second.event.id, orderId: order.id, type: "note", actorKind: "admin", data: { weight: 2 } });
		expect((await relations.children(slugs.orders, order.id, ORDER_FIELD.events, { includeDrafts: true })).items).toHaveLength(2);
	});

	it("records one entry when the same occurrence is recorded concurrently (claim in the record index)", async () => {
		const order = await orders.create(sampleOrder());
		const container = { orders, recordIndex: createInMemoryRecordIndex(createFixedClock()), clock: createFixedClock(), log } as unknown as CommerceContainer;
		const input = { orderId: order.id, type: ORDER_TIMELINE_TYPE.paymentStatusChanged, message: "Payment status changed", source: "paid>refunded:rf_1" };
		const results = await Promise.all(Array.from({ length: 6 }, () => recordOrderEvent(container, input)));
		expect(results.filter((result) => result.isNew)).toHaveLength(1);
		expect((await orders.events.listByOrder(order.id, { cursor: null, limit: 10 })).items).toHaveLength(1);
		// A later repeat finds the stored id.
		expect(await recordOrderEvent(container, input)).toMatchObject({ isNew: false, eventId: results.find((result) => result.isNew)!.eventId });
	});
});

describe("order number sequence", () => {
	it("hands out distinct numbers to concurrent callers", async () => {
		const numbers = await Promise.all(Array.from({ length: 12 }, () => orders.nextSequence(2031)));
		expect(new Set(numbers).size).toBe(12);
		expect([...numbers].sort((a, b) => a - b)).toEqual(Array.from({ length: 12 }, (_, index) => index + 1));
	});
});
