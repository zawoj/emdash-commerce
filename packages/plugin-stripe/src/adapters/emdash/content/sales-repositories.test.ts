import { describe, expect, it, vi } from "vitest";

import { commerceOptionsSchema } from "../../../contracts/options.js";
import { toCurrencyCode } from "../../../core/money.js";
import { ORDER_LIFECYCLE_STATUS, ORDER_PAYMENT_STATUS, REVIEW_FLAG, type Order } from "../../../core/order.js";
import { ORDER_ACTOR_KIND, ORDER_TIMELINE_TYPE } from "../../../core/order-timeline.js";
import { PAYMENT_PURPOSE, PAYMENT_STATUS } from "../../../core/payment.js";
import { SUBSCRIPTION_STATUS } from "../../../core/subscription.js";
import { createNullLogger } from "../../../testing/clock.js";
import { createFakeContent } from "../../../testing/fakes/content.js";
import { createInMemoryRelations } from "../../../testing/in-memory/relations.js";
import { buildSchemaDefinitions } from "../schema/collections/index.js";
import { ORDER_FIELD, ORDER_LINE_FIELD, SALES_RELATION } from "../schema/field-names.js";
import { createCustomerRepository, createOrderRepository, createPaymentRepository, createSubscriptionRepository } from "./sales-repositories.js";
import { requireWritableContent } from "./repositories.js";
import { createFakeKv } from "../../../testing/fakes/storage.js";

const options = commerceOptionsSchema.parse({ supportedCurrencies: ["pln", "eur"] });
const slugs = options.collections;
const schema = buildSchemaDefinitions(options);
const pln = toCurrencyCode("pln");
const log = createNullLogger();

/** Fake content + in-memory relations wired together: the relations port creates and finds entries in the content fake. */
const setup = () => {
	const content = createFakeContent(schema.collections);
	const relations = createInMemoryRelations(schema, {
		lookup: (collection, id) => {
			const entry = content.entries(collection).find((candidate) => candidate.id === id);
			return entry ? { slug: null, title: null, isPublished: entry.status === "published" } : null;
		},
		createEntry: (collection, input) => ({ id: content.seedEntry(collection, input.data, { status: input.status }) }),
	});
	const kv = createFakeKv();
	const writable = requireWritableContent(content);
	return {
		content,
		relations,
		kv,
		orders: createOrderRepository(writable, slugs, { relations, kv }),
		payments: createPaymentRepository(writable, slugs, { relations }),
		subscriptions: createSubscriptionRepository(writable, slugs, { relations }),
		customers: createCustomerRepository(writable, slugs, log),
	};
};

const sampleOrder = (over: Partial<Omit<Order, "id">> = {}): Omit<Order, "id"> => ({
	orderNumber: "ORD-2026-00001",
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
	reviewFlags: [REVIEW_FLAG.amountMismatch],
	cartId: "c".repeat(32),
	subscriptionId: null,
	stripe: { checkoutSessionId: "cs_1", paymentIntentId: "pi_1", customerId: "cus_1", subscriptionId: null, invoiceId: null, isLivemode: false },
	placedAt: "2026-01-15T12:00:00.000Z",
	paidAt: "2026-01-15T12:01:00.000Z",
	...over,
});

const sampleCustomer = (email = "ann@example.com") => ({
	email,
	name: "Ann",
	phone: null,
	billingAddress: null,
	shippingAddress: null,
	stripeCustomerId: "cus_1",
	orderCount: 0,
	totalSpent: {},
	firstOrderAt: null,
	lastOrderAt: null,
});

const samplePayment = (over: Record<string, unknown> = {}) => ({
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
	stripe: { paymentIntentId: "pi_1", chargeId: "ch_1", invoiceId: null },
	createdAt: "2026-01-15T12:01:00.000Z",
	updatedAt: "2026-01-15T12:01:00.000Z",
	...over,
});

const sampleSubscription = (over: Record<string, unknown> = {}) => ({
	customerId: null as string | null,
	initialOrderId: null as string | null,
	status: SUBSCRIPTION_STATUS.trialing,
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
	stripe: { subscriptionId: "sub_1", customerId: "cus_1", latestInvoiceId: null },
	providerUpdatedAt: 1_700_000_000,
	...over,
});

describe("order repository", () => {
	it("round-trips every Order member, with the customer link read through the relation", async () => {
		const { orders, customers, relations } = setup();
		const customer = await customers.create(sampleCustomer());
		const input = sampleOrder({ customerId: customer.id });
		const created = await orders.create(input);
		expect(created).toEqual({ id: created.id, ...input });
		expect(await orders.get(created.id)).toEqual(created);
		expect(relations.edges(SALES_RELATION.orderCustomer)).toEqual([{ parent: customer.id, child: created.id }]);
		expect(await orders.get("missing")).toBeNull();
	});

	it("creates the order published and leaves no relation edge for an order without a customer", async () => {
		const { orders, content, relations } = setup();
		const created = await orders.create(sampleOrder());
		expect(content.entries(slugs.orders).find((entry) => entry.id === created.id)?.status).toBe("published");
		expect(relations.edges(SALES_RELATION.orderCustomer)).toEqual([]);
		expect((await orders.get(created.id))?.customerId).toBeNull();
	});

	it("stores the lines as a scalar repeater snapshot and reads them back exactly", async () => {
		const { orders, content } = setup();
		const created = await orders.create(sampleOrder());
		const stored = content.entries(slugs.orders).find((entry) => entry.id === created.id)!.data;
		expect(stored).not.toHaveProperty("line_items");
		const rows = stored[ORDER_FIELD.lines] as Array<Record<string, unknown>>;
		expect(rows[0]).toEqual({
			[ORDER_LINE_FIELD.title]: "Shirt",
			[ORDER_LINE_FIELD.variantTitle]: "Shirt - M / Black",
			[ORDER_LINE_FIELD.sku]: "SHIRT-M-BLK",
			[ORDER_LINE_FIELD.options]: "Size: M, Colour: Black",
			[ORDER_LINE_FIELD.quantity]: 2,
			[ORDER_LINE_FIELD.unitAmount]: 1000,
			[ORDER_LINE_FIELD.subtotalAmount]: 2000,
			[ORDER_LINE_FIELD.discountAmount]: 200,
			[ORDER_LINE_FIELD.taxAmount]: 414,
			[ORDER_LINE_FIELD.totalAmount]: 2214,
			[ORDER_LINE_FIELD.productId]: "p1",
			[ORDER_LINE_FIELD.variantId]: "v1",
			[ORDER_LINE_FIELD.priceId]: "pr1",
			[ORDER_LINE_FIELD.stripePriceId]: "price_1",
			[ORDER_LINE_FIELD.priceType]: "one_time",
		});
		// A null text is left out of the row (a repeater holds scalars), and reads back as null.
		expect(rows[1]).not.toHaveProperty(ORDER_LINE_FIELD.sku);
		expect(rows[1]).not.toHaveProperty(ORDER_LINE_FIELD.variantId);
		expect((await orders.get(created.id))!.lines[1]).toMatchObject({ sku: null, variantId: null, optionsText: null, priceType: "recurring" });
	});

	it("updates only the keys in the patch, moves the links, and can clear a field", async () => {
		const { orders, customers, relations } = setup();
		const first = await customers.create(sampleCustomer("one@example.com"));
		const second = await customers.create(sampleCustomer("two@example.com"));
		const created = await orders.create(sampleOrder({ customerId: first.id }));
		const updated = await orders.update(created.id, {
			paymentStatus: ORDER_PAYMENT_STATUS.disputed,
			statusBeforeDispute: ORDER_PAYMENT_STATUS.paid,
			totals: { ...created.totals, refunded: 500 },
			paidAt: null,
		});
		expect(updated).toMatchObject({ orderStatus: "open", paymentStatus: "disputed", statusBeforeDispute: "paid", paidAt: null, email: "buyer@example.com", lines: created.lines, customerId: first.id });
		expect(updated.totals.total).toBe(3214);
		expect((await orders.update(created.id, { customerId: second.id })).customerId).toBe(second.id);
		expect(relations.edges(SALES_RELATION.orderCustomer)).toEqual([{ parent: second.id, child: created.id }]);
		expect((await orders.update(created.id, { customerId: null })).customerId).toBeNull();
		expect(relations.edges(SALES_RELATION.orderCustomer)).toEqual([]);
		await expect(orders.update("missing", { email: "x@y.z" })).rejects.toThrow(/not found/);
	});

	it("reads the subscription of an order from the relation, and refuses an unbounded set with a CommerceError", async () => {
		const { orders, subscriptions } = setup();
		const order = await orders.create(sampleOrder());
		const subscription = await subscriptions.create(sampleSubscription({ initialOrderId: order.id }));
		expect((await orders.get(order.id))?.subscriptionId).toBe(subscription.id);
		for (let index = 0; index < 50; index += 1) await subscriptions.create(sampleSubscription({ initialOrderId: order.id, stripe: { subscriptionId: `sub_x${index}`, customerId: "cus_1", latestInvoiceId: null } }));
		await expect(orders.get(order.id)).rejects.toMatchObject({ name: "CommerceError", kind: "internal", message: expect.stringContaining("more entries") });
	});

	it("lists newest first, filters both status axes and pages", async () => {
		const { orders } = setup();
		const specs = [
			{ paymentStatus: ORDER_PAYMENT_STATUS.paid, orderStatus: ORDER_LIFECYCLE_STATUS.completed },
			{ paymentStatus: ORDER_PAYMENT_STATUS.pending, orderStatus: ORDER_LIFECYCLE_STATUS.open },
			{ paymentStatus: ORDER_PAYMENT_STATUS.paid, orderStatus: ORDER_LIFECYCLE_STATUS.open },
		];
		for (const [index, spec] of specs.entries()) {
			await orders.create(sampleOrder({ ...spec, orderNumber: `ORD-2026-0000${index}`, placedAt: `2026-01-1${index + 1}T00:00:00.000Z`, stripe: { ...sampleOrder().stripe, checkoutSessionId: `cs_${index}` } }));
		}
		const all = await orders.list({ cursor: null, limit: 2 });
		expect(all.items.map((order) => order.orderNumber)).toEqual(["ORD-2026-00002", "ORD-2026-00001"]);
		expect((await orders.list({ cursor: all.cursor, limit: 2 })).items.map((order) => order.orderNumber)).toEqual(["ORD-2026-00000"]);
		expect((await orders.list({ status: ORDER_PAYMENT_STATUS.paid, cursor: null, limit: 10 })).items).toHaveLength(2);
		const open = await orders.list({ orderStatus: ORDER_LIFECYCLE_STATUS.open, cursor: null, limit: 10 });
		expect(open.items.map((order) => order.orderNumber)).toEqual(["ORD-2026-00002", "ORD-2026-00001"]);
		expect((await orders.list({ status: ORDER_PAYMENT_STATUS.paid, orderStatus: ORDER_LIFECYCLE_STATUS.open, cursor: null, limit: 10 })).items).toHaveLength(1);
	});

	it("finds an order by its checkout session through the indexed column", async () => {
		const { orders } = setup();
		await orders.create(sampleOrder({ stripe: { ...sampleOrder().stripe, checkoutSessionId: "cs_a" }, orderNumber: "A" }));
		const target = await orders.create(sampleOrder({ stripe: { ...sampleOrder().stripe, checkoutSessionId: "cs_b" }, orderNumber: "B" }));
		expect((await orders.findByCheckoutSession("cs_b"))?.id).toBe(target.id);
		expect(await orders.findByCheckoutSession("cs_none")).toBeNull();
	});

	it("allocates gap-free sequence numbers per year", async () => {
		const { orders } = setup();
		expect(await orders.nextSequence(2026)).toBe(1);
		expect(await orders.nextSequence(2026)).toBe(2);
		expect(await orders.nextSequence(2027)).toBe(1);
	});
});

describe("order timeline repository", () => {
	const event = (orderId: string, over: Record<string, unknown> = {}) => ({
		orderId,
		type: ORDER_TIMELINE_TYPE.note,
		message: "Packed",
		actorKind: ORDER_ACTOR_KIND.admin,
		actorLabel: "a@b.c",
		data: { weight: 2 },
		occurredAt: "2026-01-15T12:00:00.000Z",
		sourceKey: "k1",
		...over,
	});

	it("creates an entry linked to its order, idempotent on the source key", async () => {
		const { orders, relations } = setup();
		const order = await orders.create(sampleOrder());
		const first = await orders.events.create(event(order.id));
		const again = await orders.events.create(event(order.id, { message: "changed" }));
		expect(first.isNew).toBe(true);
		expect(again).toMatchObject({ isNew: false, event: { id: first.event.id, message: "Packed" } });
		expect(relations.edges(SALES_RELATION.orderTimeline)).toEqual([{ parent: order.id, child: first.event.id }]);
		expect((await orders.events.listByOrder(order.id, { cursor: null, limit: 10 })).items).toHaveLength(1);
	});

	it("lists newest first through the indexed order id, and pages", async () => {
		const { orders } = setup();
		const order = await orders.create(sampleOrder());
		const other = await orders.create(sampleOrder({ orderNumber: "OTHER", stripe: { ...sampleOrder().stripe, checkoutSessionId: "cs_o" } }));
		for (let index = 1; index <= 3; index += 1) await orders.events.create(event(order.id, { sourceKey: `k${index}`, message: `m${index}`, occurredAt: `2026-01-15T12:00:0${index}.000Z` }));
		await orders.events.create(event(other.id, { sourceKey: "other" }));
		const page = await orders.events.listByOrder(order.id, { cursor: null, limit: 2 });
		expect(page.items.map((item) => item.message)).toEqual(["m3", "m2"]);
		expect((await orders.events.listByOrder(order.id, { cursor: page.cursor, limit: 2 })).items.map((item) => item.message)).toEqual(["m1"]);
		expect(page.items[0]).toMatchObject({ orderId: order.id, type: "note", actorKind: "admin", actorLabel: "a@b.c", data: { weight: 2 } });
	});
});

describe("payment, subscription and customer repositories", () => {
	it("round-trips a payment, links it to its order and subscription, and lists payments by the indexed order id", async () => {
		const { orders, payments, subscriptions, relations } = setup();
		const order = await orders.create(sampleOrder());
		const subscription = await subscriptions.create(sampleSubscription({ initialOrderId: order.id }));
		const input = samplePayment({ orderId: order.id, subscriptionId: subscription.id });
		const created = await payments.create(input);
		const other = await orders.create(sampleOrder({ orderNumber: "OTHER", stripe: { ...sampleOrder().stripe, checkoutSessionId: "cs_other" } }));
		await payments.create(samplePayment({ orderId: other.id, stripe: { paymentIntentId: "pi_2", chargeId: null, invoiceId: null } }));
		expect(created).toEqual({ id: created.id, ...input });
		expect(relations.edges(SALES_RELATION.paymentOrder)).toContainEqual({ parent: order.id, child: created.id });
		expect(relations.edges(SALES_RELATION.paymentSubscription)).toEqual([{ parent: subscription.id, child: created.id }]);
		expect((await payments.listByOrder(order.id)).map((payment) => payment.id)).toEqual([created.id]);
	});

	it("never reads a relation to list the payments of an order (a relation read stops at 50 entries)", async () => {
		const { orders, payments, relations } = setup();
		const order = await orders.create(sampleOrder());
		await payments.create(samplePayment({ orderId: order.id }));
		const spy = vi.spyOn(relations, "children");
		await payments.listByOrder(order.id);
		expect(spy).not.toHaveBeenCalled();
	});

	it("links a payment to its order later and keeps the scalar key in step", async () => {
		const { orders, payments, relations } = setup();
		const order = await orders.create(sampleOrder());
		const created = await payments.create(samplePayment());
		expect(relations.edges(SALES_RELATION.paymentOrder)).toEqual([]);
		const updated = await payments.update(created.id, { orderId: order.id, amountRefunded: 500, status: PAYMENT_STATUS.failed, failureCode: "card_declined" });
		expect(updated).toMatchObject({ orderId: order.id, amountRefunded: 500, status: "failed", failureCode: "card_declined", methodType: "card" });
		expect(relations.edges(SALES_RELATION.paymentOrder)).toEqual([{ parent: order.id, child: created.id }]);
		expect((await payments.listByOrder(order.id)).map((payment) => payment.id)).toEqual([created.id]);
	});

	it("round-trips a subscription with its customer and initial order links", async () => {
		const { orders, customers, subscriptions, relations } = setup();
		const customer = await customers.create(sampleCustomer());
		const order = await orders.create(sampleOrder());
		const input = sampleSubscription({ customerId: customer.id, initialOrderId: order.id });
		const created = await subscriptions.create(input);
		expect(created).toEqual({ id: created.id, ...input });
		expect(await subscriptions.get(created.id)).toEqual(created);
		expect(relations.edges(SALES_RELATION.subscriptionCustomer)).toEqual([{ parent: customer.id, child: created.id }]);
		expect(relations.edges(SALES_RELATION.subscriptionInitialOrder)).toEqual([{ parent: order.id, child: created.id }]);
		const updated = await subscriptions.update(created.id, { status: SUBSCRIPTION_STATUS.active, cancelAtPeriodEnd: true, providerUpdatedAt: 1_700_000_100 });
		expect(updated).toMatchObject({ status: "active", cancelAtPeriodEnd: true, providerUpdatedAt: 1_700_000_100, customerId: customer.id, initialOrderId: order.id });
		const moved = await subscriptions.update(created.id, { customerId: null });
		expect(moved.customerId).toBeNull();
		expect(await subscriptions.get("nope")).toBeNull();
	});

	it("round-trips a customer with per-currency totals", async () => {
		const { customers } = setup();
		const input = { ...sampleCustomer(), shippingAddress: { line1: "x", line2: null, city: null, postalCode: null, state: null, country: "PL" }, orderCount: 2, totalSpent: { pln: 5000, eur: 100 } };
		const created = await customers.create(input);
		expect(created).toEqual({ id: created.id, ...input });
		expect(await customers.update(created.id, { orderCount: 3, totalSpent: { pln: 7500 } })).toMatchObject({ orderCount: 3, totalSpent: { pln: 7500 }, email: "ann@example.com" });
	});
});
