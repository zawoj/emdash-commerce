import { describe, expect, it } from "vitest";

import { CART_STATUS } from "../core/cart.js";
import { REVIEW_FLAG } from "../core/order.js";
import { RECORD_INDEX_KEY } from "../ports/repositories.js";
import { ProviderError } from "../ports/payment-provider.js";
import { advance, allOrders, completeCheckout, createHarness, event, outboxEvent, seedCheckout } from "./payments/test-support.js";
import { processDueInbox } from "./webhook-inbox.js";

describe("settlement of a paid checkout", () => {
	it("creates the order, payment, customer, stock commit, converted cart and events", async () => {
		const h = createHarness();
		const seeded = await seedCheckout(h);
		const result = await h.deliver(completeCheckout(h, seeded));
		expect(result.outcome).toBe("processed");

		const [order] = await allOrders(h);
		expect(order).toMatchObject({
			paymentStatus: "paid",
			orderStatus: "open",
			email: "Buyer@Example.com",
			mode: "payment",
			cartId: seeded.cartId,
			totals: { subtotal: 5000, total: 5000, refunded: 0, currency: "pln", discount: 0, tax: 0, shipping: 0 },
			reviewFlags: [],
			stripe: { checkoutSessionId: seeded.sessionId, paymentIntentId: seeded.paymentIntentId, isLivemode: false },
		});
		expect(order!.paidAt).not.toBeNull();
		expect(order!.orderNumber).toBe("ORD-2026-00001");
		expect(order!.lines).toEqual([
			expect.objectContaining({ title: "Shirt", variantTitle: "Blue M", sku: expect.stringMatching(/^SKU-/), quantity: 2, unitAmount: 2500, amountTotal: 5000, stripePriceId: seeded.providerPriceId }),
		]);

		const customer = (await h.container.customers.get(order!.customerId!))!;
		expect(customer).toMatchObject({ email: "buyer@example.com", orderCount: 1, totalSpent: { pln: 5000 }, firstOrderAt: order!.placedAt });
		expect(await h.container.recordIndex.get(RECORD_INDEX_KEY.customerByEmail("buyer@example.com"))).toBe(customer.id);

		const paymentId = await h.container.recordIndex.get(RECORD_INDEX_KEY.paymentByPaymentIntent(seeded.paymentIntentId!));
		expect(await h.container.payments.get(paymentId!)).toMatchObject({ orderId: order!.id, status: "succeeded", amount: 5000, purpose: "checkout" });
		expect(await h.container.recordIndex.get(RECORD_INDEX_KEY.orderByPaymentIntent(seeded.paymentIntentId!))).toBe(order!.id);
		expect(await h.container.recordIndex.get(RECORD_INDEX_KEY.orderByNumber(order!.orderNumber))).toBe(order!.id);

		expect(await h.container.inventory.get(seeded.sellable)).toMatchObject({ onHand: 8, reserved: 0, available: 8 });
		expect((await h.container.inventory.getReservation(seeded.reservationId))!.status).toBe("committed");
		expect(h.mirrorCalls).toEqual([{ variantId: seeded.sellable.id, onHand: 8 }]);
		expect((await h.container.carts.get(seeded.cartId))!.value).toMatchObject({ status: CART_STATUS.converted, orderId: order!.id });

		for (const [type, id] of [
			["order.created", order!.id],
			["order.paid", order!.id],
			["cart.converted", seeded.cartId],
			["customer.created", customer.id],
		] as const) {
			expect(await outboxEvent(h, type, id), `${type} event`).not.toBeNull();
		}
		expect(await outboxEvent(h, "order.needs_review", order!.id)).toBeNull();
	});

	it("trusts the provider's fresh session, not the event: async_succeeded for a still unpaid session leaves the order pending", async () => {
		const h = createHarness();
		const seeded = await seedCheckout(h);
		h.provider.completeSession(seeded.sessionId, { paymentStatus: "unpaid" });
		await h.deliver(event({ kind: "checkout_async_succeeded", sessionId: seeded.sessionId }, { type: "checkout.session.async_payment_succeeded" }));
		const [order] = await allOrders(h);
		expect(order).toMatchObject({ paymentStatus: "pending", paidAt: null });
		expect((await h.container.inventory.getReservation(seeded.reservationId))!.status).toBe("held");
		expect(await outboxEvent(h, "order.paid", order!.id)).toBeNull();
	});

	it("creates exactly one order when completed and async_succeeded are delivered concurrently and repeatedly", async () => {
		const h = createHarness();
		const seeded = await seedCheckout(h);
		const completed = completeCheckout(h, seeded);
		const succeeded = event({ kind: "checkout_async_succeeded", sessionId: seeded.sessionId }, { type: "checkout.session.async_payment_succeeded" });
		await Promise.all([h.deliver(completed), h.deliver(succeeded), h.deliver(completed), h.deliver(succeeded), h.deliver(completed)]);
		advance(h, 24 * 60 * 60 * 1000);
		await processDueInbox(h.container, 50);

		const orders = await allOrders(h);
		expect(orders).toHaveLength(1);
		expect(orders[0]!.paymentStatus).toBe("paid");
		expect(await h.container.inventory.get(seeded.sellable)).toMatchObject({ onHand: 8, reserved: 0 });
		expect((await h.container.customers.get(orders[0]!.customerId!))!.orderCount).toBe(1);
		expect(h.provider.callsOf("retrieveSession").length).toBeGreaterThan(1);
	});

	it("makes the session claim, not luck, the exactly-once gate: a slow order write cannot let a second worker create another", async () => {
		const h = createHarness();
		const seeded = await seedCheckout(h);
		const realCreate = h.container.orders.create.bind(h.container.orders);
		h.container.orders.create = async (order) => {
			await new Promise((resolve) => setTimeout(resolve, 40));
			return realCreate(order);
		};
		const completed = completeCheckout(h, seeded);
		const succeeded = event({ kind: "checkout_async_succeeded", sessionId: seeded.sessionId }, { type: "checkout.session.async_payment_succeeded" });
		const results = await Promise.all([h.deliver(completed), h.deliver(succeeded)]);
		expect(results.map((result) => result.outcome)).toEqual(["processed", "processed"]);
		expect(await allOrders(h)).toHaveLength(1);
	});

	it("finishes the follow-ups on retry after a crash and never creates a second order", async () => {
		const h = createHarness();
		const seeded = await seedCheckout(h);
		const completed = completeCheckout(h, seeded);
		h.provider.failNext("retrievePayment");
		const first = await h.deliver(completed);
		expect(first.outcome).toBe("failed");

		const [half] = await allOrders(h);
		expect(half).toMatchObject({ paymentStatus: "paid" });
		expect(await h.container.recordIndex.get(RECORD_INDEX_KEY.paymentByPaymentIntent(seeded.paymentIntentId!))).toBeNull();
		expect((await h.container.inventory.getReservation(seeded.reservationId))!.status).toBe("held");
		expect((await h.container.carts.get(seeded.cartId))!.value.status).toBe(CART_STATUS.checkoutOpen);

		advance(h, 60 * 60 * 1000);
		expect(await processDueInbox(h.container, 10)).toMatchObject({ processed: 1 });
		expect(await allOrders(h)).toHaveLength(1);
		expect(await h.container.recordIndex.get(RECORD_INDEX_KEY.paymentByPaymentIntent(seeded.paymentIntentId!))).not.toBeNull();
		expect((await h.container.inventory.getReservation(seeded.reservationId))!.status).toBe("committed");
		expect((await h.container.carts.get(seeded.cartId))!.value.status).toBe(CART_STATUS.converted);
		expect(await outboxEvent(h, "order.paid", half!.id)).not.toBeNull();
	});

	it("does not create a second order when the winner died between creating the order and indexing it", async () => {
		const h = createHarness();
		const seeded = await seedCheckout(h);
		const realSet = h.container.recordIndex.set.bind(h.container.recordIndex);
		let isArmed = true;
		h.container.recordIndex.set = async (key, value) => {
			if (isArmed && key === RECORD_INDEX_KEY.orderBySession(seeded.sessionId)) {
				isArmed = false;
				throw new Error("crash before the index write");
			}
			return realSet(key, value);
		};
		const completed = completeCheckout(h, seeded);
		expect((await h.deliver(completed)).outcome).toBe("failed");
		expect(await allOrders(h)).toHaveLength(1);

		advance(h, 60 * 60 * 1000);
		await processDueInbox(h.container, 10);
		expect(await allOrders(h)).toHaveLength(1);
		const [order] = await allOrders(h);
		expect(await h.container.recordIndex.get(RECORD_INDEX_KEY.orderBySession(seeded.sessionId))).toBe(order!.id);
		expect(order!.paymentStatus).toBe("paid");
	});

	it("keeps the stock held for a pending async payment and commits it when the payment succeeds", async () => {
		const h = createHarness();
		const seeded = await seedCheckout(h);
		await h.deliver(completeCheckout(h, seeded, { paymentStatus: "unpaid" }));
		const [pending] = await allOrders(h);
		expect(pending).toMatchObject({ paymentStatus: "pending", paidAt: null });
		expect(await h.container.inventory.get(seeded.sellable)).toMatchObject({ onHand: 10, reserved: 2, available: 8 });
		expect((await h.container.carts.get(seeded.cartId))!.value.status).toBe(CART_STATUS.converted);
		expect(await outboxEvent(h, "order.paid", pending!.id)).toBeNull();
		expect((await h.container.customers.get(pending!.customerId!))!.orderCount).toBe(0);

		h.provider.completeSession(seeded.sessionId, { paymentStatus: "paid" });
		await h.deliver(event({ kind: "checkout_async_succeeded", sessionId: seeded.sessionId }, { type: "checkout.session.async_payment_succeeded" }));
		const orders = await allOrders(h);
		expect(orders).toHaveLength(1);
		expect(orders[0]).toMatchObject({ paymentStatus: "paid" });
		expect(await h.container.inventory.get(seeded.sellable)).toMatchObject({ onHand: 8, reserved: 0 });
		expect(await outboxEvent(h, "order.paid", pending!.id)).not.toBeNull();
		expect((await h.container.customers.get(pending!.customerId!))!.orderCount).toBe(1);
	});

	it("fails the order and releases the stock when the async payment fails", async () => {
		const h = createHarness();
		const seeded = await seedCheckout(h);
		await h.deliver(completeCheckout(h, seeded, { paymentStatus: "unpaid" }));
		await h.deliver(event({ kind: "checkout_async_failed", sessionId: seeded.sessionId }, { type: "checkout.session.async_payment_failed" }));
		const [order] = await allOrders(h);
		expect(order!.paymentStatus).toBe("failed");
		expect(await h.container.inventory.get(seeded.sellable)).toMatchObject({ onHand: 10, reserved: 0, available: 10 });
		expect((await h.container.inventory.getReservation(seeded.reservationId))!.status).toBe("released");
		expect(await outboxEvent(h, "order.payment_failed", order!.id)).not.toBeNull();
	});

	it("applies an async failure that arrives before the order exists", async () => {
		const h = createHarness();
		const seeded = await seedCheckout(h);
		await h.deliver(event({ kind: "checkout_async_failed", sessionId: seeded.sessionId }, { type: "checkout.session.async_payment_failed" }));
		expect(await allOrders(h)).toHaveLength(0);
		await h.deliver(completeCheckout(h, seeded, { paymentStatus: "unpaid" }));
		const [order] = await allOrders(h);
		expect(order!.paymentStatus).toBe("failed");
		expect((await h.container.inventory.getReservation(seeded.reservationId))!.status).toBe("released");
	});

	it("releases the stock and reopens the cart when the session expires", async () => {
		const h = createHarness();
		const seeded = await seedCheckout(h);
		h.provider.sessions.get(seeded.sessionId)!.session.status = "expired";
		const result = await h.deliver(event({ kind: "checkout_expired", sessionId: seeded.sessionId }, { type: "checkout.session.expired" }));
		expect(result.outcome).toBe("processed");
		expect(await allOrders(h)).toHaveLength(0);
		expect(await h.container.inventory.get(seeded.sellable)).toMatchObject({ reserved: 0, available: 10 });
		expect((await h.container.carts.get(seeded.cartId))!.value).toMatchObject({ status: CART_STATUS.active, checkout: null });
	});

	it("leaves a cart alone that already moved on to another session, and does nothing once an order exists", async () => {
		const h = createHarness();
		const seeded = await seedCheckout(h);
		const loaded = (await h.container.carts.get(seeded.cartId))!;
		await h.container.carts.put({ ...loaded.value, checkout: { ...loaded.value.checkout!, sessionId: "cs_other" } }, loaded.revision);
		await h.deliver(event({ kind: "checkout_expired", sessionId: seeded.sessionId }, { type: "checkout.session.expired" }));
		expect((await h.container.carts.get(seeded.cartId))!.value.status).toBe(CART_STATUS.checkoutOpen);

		const paid = await seedCheckout(h);
		await h.deliver(completeCheckout(h, paid));
		const result = await h.deliver(event({ kind: "checkout_expired", sessionId: paid.sessionId }, { type: "checkout.session.expired" }));
		expect(result.outcome).toBe("ignored");
		expect((await h.container.inventory.getReservation(paid.reservationId))!.status).toBe("committed");
	});
});

describe("settlement validation never drops a paid order", () => {
	it("flags amount and line mismatches against the server snapshot and still records the order", async () => {
		const h = createHarness();
		const seeded = await seedCheckout(h);
		const result = await h.deliver(
			completeCheckout(h, seeded, {
				amountSubtotal: 100,
				amountTotal: 100,
				lines: [{ providerPriceId: seeded.providerPriceId, quantity: 1, description: "Shirt", amountSubtotal: 100, amountDiscount: 0, amountTax: 0, amountTotal: 100, currency: "pln" as never }],
			}),
		);
		expect(result.outcome).toBe("processed");
		const [order] = await allOrders(h);
		expect(order).toMatchObject({ paymentStatus: "paid", totals: { total: 100 } });
		expect(order!.reviewFlags).toEqual(expect.arrayContaining([REVIEW_FLAG.amountMismatch, REVIEW_FLAG.lineItemsMismatch]));
		expect(await outboxEvent(h, "order.needs_review", `${order!.id}:${[...order!.reviewFlags].sort().join(",")}`)).toMatchObject({ data: { orderId: order!.id } });
	});

	it("flags a currency mismatch", async () => {
		const h = createHarness();
		const seeded = await seedCheckout(h);
		await h.deliver(completeCheckout(h, seeded, { currency: "eur" as never }));
		expect((await allOrders(h))[0]!.reviewFlags).toContain(REVIEW_FLAG.currencyMismatch);
	});

	it("flags a missing snapshot and builds the lines from the session", async () => {
		const h = createHarness();
		const seeded = await seedCheckout(h, { withSnapshot: false });
		await h.deliver(completeCheckout(h, seeded));
		const [order] = await allOrders(h);
		expect(order).toMatchObject({ paymentStatus: "paid", reviewFlags: [REVIEW_FLAG.missingSnapshot] });
		expect(order!.lines).toEqual([expect.objectContaining({ title: "Shirt", priceId: seeded.priceId, quantity: 2, unitAmount: 2500 })]);
	});

	it("snapshots each line with the provider's discount and tax, the variant's SKU, and the variant's option labels", async () => {
		const h = createHarness();
		const seeded = await seedCheckout(h);
		const variantId = seeded.sellable.id;
		// Option labels are resolved from the product type's axes: attribute storefront label + value label, in axis order.
		const attribute = (id: string, name: string, storefrontLabel: string, values: Array<[string, string]>) => ({
			id,
			name,
			storefrontLabel,
			code: null,
			inputType: "select" as const,
			presentation: "buttons" as const,
			unit: null,
			isFilterable: false,
			values: values.map(([valueId, label]) => ({ id: valueId, attributeId: id, label, code: null, swatch: null })),
		});
		h.world.catalog.addAttribute(attribute("size", "Size", "Size", [["sz-m", "M"], ["sz-l", "L"]]));
		h.world.catalog.addAttribute(attribute("colour", "Colour internal", "Colour", [["c-blue", "Blue"], ["c-red", "Red"]]));
		h.world.catalog.addProductType({ id: "shirt-type", name: "Shirt", code: null, variantAxisIds: ["size", "colour"], allowedValueIds: [], specAttributeIds: [], requiredSpecIds: [] });
		const variant = (await h.container.catalog.getVariant(variantId))!;
		h.world.catalog.addProduct({ ...(await h.container.catalog.getProduct(variant.productId))!, typeId: "shirt-type" });
		// Linked in the opposite order to the axes: the text still follows the axis order.
		h.world.catalog.addVariant({ ...variant, optionValueIds: ["c-blue", "sz-m"], optionsKey: "c-blue|sz-m" });
		const session = h.provider.sessions.get(seeded.sessionId)!.session;
		await h.deliver(
			completeCheckout(h, seeded, {
				lines: [{ ...session.lines[0]!, amountSubtotal: 5000, amountDiscount: 500, amountTax: 1035, amountTotal: 5535 }],
			}),
		);
		const [order] = await allOrders(h);
		expect(order!.lines).toEqual([
			expect.objectContaining({
				title: "Shirt",
				variantTitle: "Blue M",
				sku: expect.stringMatching(/^SKU-/),
				optionsText: "Size: M, Colour: Blue",
				quantity: 2,
				unitAmount: 2500,
				amountSubtotal: 5000,
				discountAmount: 500,
				taxAmount: 1035,
				amountTotal: 5535,
			}),
		]);
	});

	it("flags a session whose livemode differs from what the key and event say", async () => {
		const h = createHarness({ isLivemode: true });
		const seeded = await seedCheckout(h);
		await h.deliver(completeCheckout(h, seeded));
		expect((await allOrders(h))[0]!.reviewFlags).toContain(REVIEW_FLAG.livemodeMismatch);
	});

	it("flags an order that drives stock negative when the reservation was already released", async () => {
		const h = createHarness();
		const seeded = await seedCheckout(h, { stock: 2 });
		await h.deliver(completeCheckout(h, seeded, { paymentStatus: "unpaid" }));
		await h.container.inventory.release(seeded.reservationId);
		await h.container.inventory.adjust(seeded.sellable, -1, "other sale");
		h.provider.completeSession(seeded.sessionId, { paymentStatus: "paid" });
		await h.deliver(event({ kind: "checkout_async_succeeded", sessionId: seeded.sessionId }, { type: "checkout.session.async_payment_succeeded" }));
		const [order] = await allOrders(h);
		expect(order!.paymentStatus).toBe("paid");
		expect(order!.reviewFlags).toContain(REVIEW_FLAG.inventoryShortfall);
		expect(await h.container.inventory.get(seeded.sellable)).toMatchObject({ onHand: -1, available: -1 });
	});
});

describe("what is not ours or not for this key", () => {
	it("ignores a session this plugin did not create", async () => {
		const h = createHarness();
		const seeded = await seedCheckout(h);
		h.provider.completeSession(seeded.sessionId, { metadata: {} });
		const result = await h.deliver(event({ kind: "checkout_completed", sessionId: seeded.sessionId }, { type: "checkout.session.completed" }));
		expect(result).toMatchObject({ outcome: "ignored", reason: expect.stringContaining("not created by this store") });
		expect(await allOrders(h)).toHaveLength(0);
	});

	it("ignores an event whose livemode does not match the key", async () => {
		const h = createHarness({ secretKey: "sk_live_fake" });
		const seeded = await seedCheckout(h);
		const result = await h.deliver(completeCheckout(h, seeded));
		expect(result.outcome).toBe("ignored");
		expect(await allOrders(h)).toHaveLength(0);
		expect((await h.container.inbox.get(result.outcome === "ignored" ? (await h.container.inbox.listByStatus("ignored", 5, null)).items[0]!.eventId : ""))!.status).toBe("ignored");
	});

	it("retries when the provider cannot be reached, and a retry succeeds", async () => {
		const h = createHarness();
		const seeded = await seedCheckout(h);
		h.provider.failNext("retrieveSession", new ProviderError("down", { isRetryable: true }));
		const completed = completeCheckout(h, seeded);
		expect((await h.deliver(completed)).outcome).toBe("failed");
		advance(h, 60_000);
		expect((await processDueInbox(h.container, 10)).processed).toBe(1);
		expect(await allOrders(h)).toHaveLength(1);
	});
});

describe("order numbers", () => {
	it("retries a colliding number and takes the next free one", async () => {
		const numbers = ["ORD-TAKEN", "ORD-TAKEN", "ORD-FREE"];
		const h = createHarness({ extensions: { generateOrderNumber: () => numbers.shift() ?? "ORD-LAST" } });
		await h.container.recordIndex.set(RECORD_INDEX_KEY.orderByNumber("ORD-TAKEN"), "someone-else");
		const seeded = await seedCheckout(h);
		await h.deliver(completeCheckout(h, seeded));
		expect((await allOrders(h))[0]!.orderNumber).toBe("ORD-FREE");
	});

	it("gives up after five collisions and retries the event", async () => {
		const h = createHarness({ extensions: { generateOrderNumber: () => "ORD-TAKEN" } });
		await h.container.recordIndex.set(RECORD_INDEX_KEY.orderByNumber("ORD-TAKEN"), "someone-else");
		const seeded = await seedCheckout(h);
		const result = await h.deliver(completeCheckout(h, seeded));
		expect(result).toMatchObject({ outcome: "failed", error: expect.stringContaining("unique order number") });
		expect(await allOrders(h)).toHaveLength(0);
	});
});

describe("customers", () => {
	it("creates one customer when two checkouts with one email settle concurrently, and counts each order once", async () => {
		const h = createHarness();
		const a = await seedCheckout(h, { email: "same@example.com" });
		const b = await seedCheckout(h, { email: "SAME@example.com " });
		const ea = completeCheckout(h, a);
		const eb = completeCheckout(h, b);
		await Promise.all([h.deliver(ea), h.deliver(eb)]);
		advance(h, 60 * 60 * 1000);
		await processDueInbox(h.container, 10);
		// Replays and the other event kind for the same sessions must not count the orders again.
		await h.deliver(event({ kind: "checkout_async_succeeded", sessionId: a.sessionId }, { type: "checkout.session.async_payment_succeeded" }));
		await h.container.inbox.requeue(ea.eventId);
		await processDueInbox(h.container, 10);

		const orders = await allOrders(h);
		expect(orders).toHaveLength(2);
		expect(new Set(orders.map((order) => order.customerId)).size).toBe(1);
		const customer = (await h.container.customers.get(orders[0]!.customerId!))!;
		expect(customer).toMatchObject({ email: "same@example.com", orderCount: 2, totalSpent: { pln: 10000 } });
	});
});
