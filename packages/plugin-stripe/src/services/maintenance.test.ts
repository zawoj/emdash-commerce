import { describe, expect, it } from "vitest";

import { CART_STATUS, type Cart } from "../core/cart.js";
import type { AnyCommerceEvent } from "../core/events.js";
import { createFakeKv } from "../testing/fakes/storage.js";
import { MAINTENANCE, KV_LAST_RECONCILE, purgeStale, reconcileIfDue, sweepCarts } from "./maintenance.js";
import { createHarness, type Harness } from "./payments/test-support.js";
import { recordingPublisher } from "./cart/test-support.js";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const iso = (h: Harness, offsetMs: number): string => new Date(h.world.clock.now().getTime() + offsetMs).toISOString();

const putCart = async (h: Harness, over: Partial<Cart> & { id: string }): Promise<Cart> => {
	const cart: Cart = {
		status: CART_STATUS.active,
		lines: [{ priceId: "price_a", quantity: 2, addedAt: iso(h, -DAY * 2) }, { priceId: "price_b", quantity: 1, addedAt: iso(h, -DAY * 2) }],
		email: "shopper@example.com",
		checkout: null,
		orderId: null,
		context: { userAgent: null, country: null },
		createdAt: iso(h, -DAY * 3),
		updatedAt: iso(h, -DAY * 2),
		expiresAt: iso(h, DAY * 20),
		...over,
	};
	await h.container.carts.put(cart, null);
	return cart;
};

const abandoned = (events: readonly AnyCommerceEvent[]): AnyCommerceEvent[] => events.filter((event) => event.type === "cart.abandoned");

describe("sweepCarts", () => {
	it("marks an idle cart with an email and lines abandoned and emits cart.abandoned once", async () => {
		const h = createHarness({ options: { cart: { abandonAfterHours: 24 } } });
		await putCart(h, { id: "c1" });
		const publisher = recordingPublisher();
		const result = await sweepCarts(h.container, publisher);
		expect(result).toMatchObject({ abandoned: 1, expired: 0, deleted: 0 });
		expect((await h.container.carts.get("c1"))!.value.status).toBe(CART_STATUS.abandoned);
		expect(publisher.events[0]).toMatchObject({ type: "cart.abandoned", data: { cartId: "c1", email: "shopper@example.com", itemCount: 3 } });
		// a second sweep neither re-abandons nor re-emits
		expect(await sweepCarts(h.container, publisher)).toMatchObject({ abandoned: 0 });
		expect(abandoned(publisher.events)).toHaveLength(1);
	});

	it("leaves alone: recent carts, carts without an email, empty carts, and carts in checkout", async () => {
		const h = createHarness({ options: { cart: { abandonAfterHours: 24 } } });
		await putCart(h, { id: "recent", updatedAt: iso(h, -2 * HOUR) });
		await putCart(h, { id: "noemail", email: null });
		await putCart(h, { id: "empty", lines: [] });
		await putCart(h, { id: "checkout", status: CART_STATUS.checkoutOpen });
		const result = await sweepCarts(h.container, recordingPublisher());
		expect(result).toMatchObject({ abandoned: 0, expired: 0, deleted: 0 });
		for (const id of ["recent", "noemail", "empty"]) expect((await h.container.carts.get(id))!.value.status).toBe(CART_STATUS.active);
	});

	it("respects cart.abandonAfterHours", async () => {
		const h = createHarness({ options: { cart: { abandonAfterHours: 72 } } });
		await putCart(h, { id: "c1", updatedAt: iso(h, -DAY * 2) });
		expect(await sweepCarts(h.container, recordingPublisher())).toMatchObject({ abandoned: 0 });
		h.world.clock.advance(2 * DAY);
		expect(await sweepCarts(h.container, recordingPublisher())).toMatchObject({ abandoned: 1 });
	});

	it("expires a cart past expiresAt, whatever its status or email, and keeps the record during the grace period", async () => {
		const h = createHarness();
		await putCart(h, { id: "old", expiresAt: iso(h, -HOUR), email: null, updatedAt: iso(h, -DAY) });
		await putCart(h, { id: "old-abandoned", status: CART_STATUS.abandoned, expiresAt: iso(h, -HOUR) });
		const result = await sweepCarts(h.container, recordingPublisher());
		expect(result).toMatchObject({ expired: 2, deleted: 0 });
		expect((await h.container.carts.get("old"))!.value.status).toBe(CART_STATUS.expired);
	});

	it("deletes expired and converted carts after the grace period, not before", async () => {
		const h = createHarness();
		await putCart(h, { id: "stale-expired", status: CART_STATUS.expired, expiresAt: iso(h, -10 * DAY), updatedAt: iso(h, -8 * DAY) });
		await putCart(h, { id: "fresh-expired", status: CART_STATUS.expired, expiresAt: iso(h, -2 * DAY), updatedAt: iso(h, -DAY) });
		await putCart(h, { id: "stale-converted", status: CART_STATUS.converted, updatedAt: iso(h, -9 * DAY) });
		const result = await sweepCarts(h.container, recordingPublisher());
		expect(result.deleted).toBe(2);
		expect(await h.container.carts.get("stale-expired")).toBeNull();
		expect(await h.container.carts.get("stale-converted")).toBeNull();
		expect(await h.container.carts.get("fresh-expired")).not.toBeNull();
		expect(MAINTENANCE.cartGraceMs).toBe(7 * DAY);
	});

	it("a cart that is revived and abandoned again emits a second event", async () => {
		const h = createHarness({ options: { cart: { abandonAfterHours: 24 } } });
		const publisher = recordingPublisher();
		await putCart(h, { id: "c1" });
		await sweepCarts(h.container, publisher);
		const stored = (await h.container.carts.get("c1"))!;
		await h.container.carts.put({ ...stored.value, status: CART_STATUS.active }, stored.revision);
		h.world.clock.advance(2 * DAY);
		await sweepCarts(h.container, publisher);
		expect(new Set(abandoned(publisher.events).map((event) => event.id)).size).toBe(2);
	});
});

describe("reconcileIfDue", () => {
	it("runs at most once per 15 minutes", async () => {
		const h = createHarness();
		const kv = createFakeKv();
		expect(await reconcileIfDue(h.container, kv)).toMatchObject({ ran: true });
		expect(h.provider.callsOf("listEventsSince")).toHaveLength(1);
		h.world.clock.advance(14 * 60 * 1000);
		expect(await reconcileIfDue(h.container, kv)).toEqual({ ran: false, reason: "throttled" });
		expect(h.provider.callsOf("listEventsSince")).toHaveLength(1);
		h.world.clock.advance(2 * 60 * 1000);
		expect(await reconcileIfDue(h.container, kv)).toMatchObject({ ran: true });
		expect(h.provider.callsOf("listEventsSince")).toHaveLength(2);
		expect(MAINTENANCE.reconcileIntervalMs).toBe(15 * 60 * 1000);
	});

	it("two overlapping runs reconcile once", async () => {
		const h = createHarness();
		const kv = createFakeKv();
		const results = await Promise.all([reconcileIfDue(h.container, kv), reconcileIfDue(h.container, kv)]);
		expect(results.filter((result) => result.ran)).toHaveLength(1);
		expect(h.provider.callsOf("listEventsSince")).toHaveLength(1);
	});

	it("a failing reconciliation is throttled too (not hammered), and the timestamp is kept", async () => {
		const h = createHarness();
		const kv = createFakeKv();
		h.provider.failNext("listEventsSince");
		await expect(reconcileIfDue(h.container, kv)).rejects.toThrow();
		expect(await kv.get(KV_LAST_RECONCILE)).toBe(h.world.clock.now().getTime());
		expect(await reconcileIfDue(h.container, kv)).toEqual({ ran: false, reason: "throttled" });
	});

	it("does nothing when webhooks.isReconcileEnabled is false", async () => {
		const h = createHarness({ options: { webhooks: { isReconcileEnabled: false } } });
		expect(await reconcileIfDue(h.container, createFakeKv())).toEqual({ ran: false, reason: "disabled" });
		expect(h.provider.callsOf("listEventsSince")).toHaveLength(0);
	});
});

describe("purgeStale", () => {
	const record = async (h: Harness, id: string, status: "processed" | "ignored" | "failed" | "dead", ageMs: number) => {
		const event = { eventId: id, type: "x", created: 1, isLivemode: false, action: { kind: "unsupported" as const }, raw: {} };
		h.world.clock.advance(-ageMs);
		await h.container.inbox.record(event, "{}", "webhook");
		h.world.clock.advance(ageMs);
		if (status === "processed") await h.container.inbox.markProcessed(id);
		if (status === "ignored") await h.container.inbox.markIgnored(id, "r");
		if (status === "failed") await h.container.inbox.markFailed(id, "e", iso(h, HOUR));
		if (status === "dead") await h.container.inbox.markFailed(id, "e", null);
	};

	it("removes processed and ignored inbox events older than 30 days and keeps everything else", async () => {
		const h = createHarness();
		await record(h, "old-processed", "processed", 31 * DAY);
		await record(h, "old-ignored", "ignored", 40 * DAY);
		await record(h, "new-processed", "processed", 29 * DAY);
		await record(h, "old-failed", "failed", 60 * DAY);
		await record(h, "old-dead", "dead", 60 * DAY);
		const result = await purgeStale(h.container);
		expect(result.inbox).toBe(2);
		for (const id of ["old-processed", "old-ignored"]) expect(await h.container.inbox.get(id)).toBeNull();
		for (const id of ["new-processed", "old-failed", "old-dead"]) expect(await h.container.inbox.get(id)).not.toBeNull();
	});

	it("removes fully delivered outbox events older than 30 days, never undelivered or dead ones", async () => {
		const h = createHarness();
		const make = (id: string): AnyCommerceEvent => ({ id, type: "customer.updated", occurredAt: iso(h, 0), data: { customerId: id } });
		h.world.clock.advance(-40 * DAY);
		await h.container.outbox.enqueue([make("delivered-old"), make("pending-old"), make("dead-old"), make("partial-old")], ["a"]);
		await h.container.outbox.enqueue([make("two")], ["a", "b"]);
		h.world.clock.advance(40 * DAY);
		await h.container.outbox.enqueue([make("delivered-new")], ["a"]);
		const set = async (id: string, deliveries: Record<string, "delivered" | "pending" | "dead">) => {
			const found = (await h.container.outbox.get(id))!;
			const next = structuredClone(found.value);
			for (const [name, status] of Object.entries(deliveries)) next.deliveries[name] = { status, attempts: 1, lastError: null, nextAttemptAt: null };
			await h.container.outbox.update(next, found.revision);
		};
		await set("delivered-old", { a: "delivered" });
		await set("dead-old", { a: "dead" });
		await set("two", { a: "delivered", b: "pending" });
		await set("delivered-new", { a: "delivered" });
		const result = await purgeStale(h.container);
		expect(result.outbox).toBe(1);
		expect(await h.container.outbox.get("delivered-old")).toBeNull();
		for (const id of ["pending-old", "dead-old", "two", "delivered-new"]) expect(await h.container.outbox.get(id), id).not.toBeNull();
	});

	it("removes rate-limit windows that ended, not the current one", async () => {
		const h = createHarness();
		await h.container.rateLimiter.hit("k", 5, HOUR);
		h.world.clock.advance(2 * HOUR);
		await h.container.rateLimiter.hit("k", 1, HOUR);
		expect((await purgeStale(h.container)).rateLimits).toBe(1);
		// the current window still counts
		expect(await h.container.rateLimiter.hit("k", 1, HOUR)).toBe(false);
	});
});
