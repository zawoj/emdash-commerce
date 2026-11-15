import { describe, expect, it } from "vitest";

import { CART_STATUS, type Cart } from "../../core/cart.js";
import type { AnyCommerceEvent } from "../../core/events.js";
import type { ProviderWebhookEvent } from "../../ports/payment-provider.js";
import type {
	CartStore,
	CatalogLink,
	CatalogLinkStore,
	CheckoutSnapshotStore,
	EventOutbox,
	RateLimiter,
	RefundStore,
	WebhookInbox,
} from "../../ports/repositories.js";
import type { FixedClock } from "../clock.js";

const iso = (clock: FixedClock, offsetMs = 0): string => new Date(clock.now().getTime() + offsetMs).toISOString();

// --- Carts ---------------------------------------------------------------------------------------------

const cart = (id: string, over: Partial<Cart> = {}): Cart => ({
	id,
	status: CART_STATUS.active,
	lines: [],
	email: null,
	checkout: null,
	orderId: null,
	context: { userAgent: null, country: null },
	createdAt: "2026-01-15T12:00:00.000Z",
	updatedAt: "2026-01-15T12:00:00.000Z",
	expiresAt: "2026-02-15T12:00:00.000Z",
	...over,
});

export const cartStoreContract = (name: string, create: () => { store: CartStore }): void => {
	describe(`CartStore contract: ${name}`, () => {
		it("creates only when absent and updates only with the current revision", async () => {
			const { store } = create();
			const created = await store.put(cart("c1"), null);
			expect(created.applied).toBe(true);
			expect((await store.put(cart("c1"), null)).applied).toBe(false);
			const read = await store.get("c1");
			expect(read?.value.id).toBe("c1");
			const updated = await store.put(cart("c1", { email: "a@b.c" }), read!.revision);
			expect(updated.applied).toBe(true);
			expect((await store.put(cart("c1", { email: "x@y.z" }), read!.revision)).applied).toBe(false);
			expect((await store.get("c1"))?.value.email).toBe("a@b.c");
		});

		it("lets exactly one of several concurrent writers with the same revision win", async () => {
			const { store } = create();
			await store.put(cart("c1"), null);
			const { revision } = (await store.get("c1"))!;
			const results = await Promise.all(Array.from({ length: 8 }, (_, index) => store.put(cart("c1", { email: `${index}@x.y` }), revision)));
			expect(results.filter((result) => result.applied)).toHaveLength(1);
		});

		it("returns null for a missing cart and deletes idempotently", async () => {
			const { store } = create();
			expect(await store.get("nope")).toBeNull();
			await store.put(cart("c1"), null);
			await store.delete("c1");
			await store.delete("c1");
			expect(await store.get("c1")).toBeNull();
		});

		it("lists carts to expire and carts by status and age", async () => {
			const { store } = create();
			await store.put(cart("expired", { expiresAt: "2026-01-01T00:00:00.000Z" }), null);
			await store.put(cart("open", { status: CART_STATUS.checkoutOpen, expiresAt: "2026-01-02T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z" }), null);
			await store.put(cart("done", { status: CART_STATUS.converted, expiresAt: "2026-01-01T00:00:00.000Z" }), null);
			await store.put(cart("fresh"), null);
			const expiring = await store.listExpiringBefore("2026-01-10T00:00:00.000Z", 10);
			expect(expiring.map((item) => item.id)).toEqual(["expired", "open"]);
			const stale = await store.listByStatus(CART_STATUS.checkoutOpen, "2026-01-10T00:00:00.000Z", 10);
			expect(stale.map((item) => item.id)).toEqual(["open"]);
			expect(await store.listByStatus(CART_STATUS.checkoutOpen, "2026-01-01T00:00:00.000Z", 10)).toEqual([]);
		});
	});
};

// --- Catalog links -------------------------------------------------------------------------------------

const link = (entityKey: string, over: Partial<CatalogLink> = {}): CatalogLink => ({
	entityKey,
	providerId: null,
	providerPriceByFingerprint: {},
	fingerprint: null,
	syncStatus: "pending",
	lastError: null,
	attempts: 0,
	nextAttemptAt: null,
	syncedAt: null,
	driftFields: [],
	...over,
});

export const catalogLinkStoreContract = (name: string, create: () => { store: CatalogLinkStore; clock: FixedClock }): void => {
	describe(`CatalogLinkStore contract: ${name}`, () => {
		it("applies compare-and-set revisions", async () => {
			const { store } = create();
			expect((await store.put(link("product:1"), null)).applied).toBe(true);
			expect((await store.put(link("product:1"), null)).applied).toBe(false);
			const read = await store.get("product:1");
			expect((await store.put(link("product:1", { providerId: "prod_1" }), read!.revision)).applied).toBe(true);
			expect((await store.put(link("product:1", { providerId: "prod_2" }), read!.revision)).applied).toBe(false);
			expect((await store.get("product:1"))?.value.providerId).toBe("prod_1");
		});

		it("round-trips the sync version and the last written state", async () => {
			const { store } = create();
			const written = { name: "Mug", isActive: true };
			await store.put(link("product:1", { syncVersion: 4, lastWrittenHash: "abc", lastWritten: written }), null);
			expect((await store.get("product:1"))?.value).toMatchObject({ syncVersion: 4, lastWrittenHash: "abc", lastWritten: written });
		});

		it("finds a link by its provider id", async () => {
			const { store } = create();
			await store.put(link("product:1", { providerId: "prod_1" }), null);
			await store.put(link("price:9", { providerId: "price_9", syncStatus: "synced" }), null);
			expect((await store.findByProviderId("price_9"))?.entityKey).toBe("price:9");
			expect(await store.findByProviderId("prod_x")).toBeNull();
		});

		it("lists what is due: unsynced and past its next attempt", async () => {
			const { store, clock } = create();
			await store.put(link("a:pending"), null);
			await store.put(link("b:synced", { syncStatus: "synced" }), null);
			await store.put(link("c:retry-later", { syncStatus: "failed", nextAttemptAt: iso(clock, 60_000) }), null);
			await store.put(link("d:retry-now", { syncStatus: "failed", nextAttemptAt: iso(clock, -60_000) }), null);
			const due = await store.listDue(iso(clock), 10);
			expect(due.map((item) => item.entityKey).sort()).toEqual(["a:pending", "d:retry-now"]);
			const failed = await store.listFailed(10);
			expect(failed.map((item) => item.entityKey).sort()).toEqual(["c:retry-later", "d:retry-now"]);
		});
	});
};

// --- Checkout snapshots, refunds ------------------------------------------------------------------------

export const snapshotStoreContract = (name: string, create: () => { store: CheckoutSnapshotStore }): void => {
	describe(`CheckoutSnapshotStore contract: ${name}`, () => {
		it("finds a snapshot by checkout id and, once a session is attached, by session id", async () => {
			const { store } = create();
			const snapshot = {
				checkoutId: "co1",
				cartId: "cart",
				sessionId: null,
				mode: "payment" as const,
				currency: "pln",
				lines: [{ priceId: "p", providerPriceId: "price_1", quantity: 1, unitAmount: 100 }],
				expectedSubtotal: 100,
				reservationId: null,
				customerId: null,
				createdAt: "2026-01-15T12:00:00.000Z",
			};
			await store.put(snapshot);
			expect(await store.getBySession("cs_1")).toBeNull();
			await store.put({ ...snapshot, sessionId: "cs_1" });
			expect((await store.getBySession("cs_1"))?.checkoutId).toBe("co1");
			expect((await store.get("co1"))?.sessionId).toBe("cs_1");
			expect(await store.get("nope")).toBeNull();
		});

		it("lists snapshots created before a time, oldest first, after a cursor, and deletes by checkout id", async () => {
			const { store } = create();
			const snapshot = {
				cartId: "cart",
				sessionId: null,
				mode: "payment" as const,
				currency: "pln",
				lines: [],
				expectedSubtotal: 0,
				reservationId: null,
				customerId: null,
			};
			for (const [checkoutId, createdAt] of [["c3", "2026-01-15T12:03:00.000Z"], ["c1", "2026-01-15T12:01:00.000Z"], ["c2", "2026-01-15T12:02:00.000Z"], ["c4", "2026-01-15T12:30:00.000Z"]] as const) {
				await store.put({ ...snapshot, checkoutId, createdAt });
			}
			const before = "2026-01-15T12:10:00.000Z";
			expect((await store.listCreatedBefore(before, 10)).map((item) => item.checkoutId)).toEqual(["c1", "c2", "c3"]);
			expect((await store.listCreatedBefore(before, 2)).map((item) => item.checkoutId)).toEqual(["c1", "c2"]);
			expect((await store.listCreatedBefore(before, 10, "2026-01-15T12:01:00.000Z")).map((item) => item.checkoutId)).toEqual(["c2", "c3"]);
			await store.delete("c2");
			await store.delete("missing");
			expect(await store.get("c2")).toBeNull();
			expect((await store.listCreatedBefore(before, 10)).map((item) => item.checkoutId)).toEqual(["c1", "c3"]);
		});
	});
};

export const refundStoreContract = (name: string, create: () => { store: RefundStore }): void => {
	describe(`RefundStore contract: ${name}`, () => {
		it("stores a refund by id and lists them per order oldest first", async () => {
			const { store } = create();
			const base = { paymentId: "pay", amount: 100, currency: "pln" as never, reason: null, note: null, status: "pending" as const, stripeRefundId: null, requestedBy: null, updatedAt: "x" };
			await store.put({ ...base, id: "r2", orderId: "o1", createdAt: "2026-01-15T12:02:00.000Z" });
			await store.put({ ...base, id: "r1", orderId: "o1", createdAt: "2026-01-15T12:01:00.000Z" });
			await store.put({ ...base, id: "r3", orderId: "o2", createdAt: "2026-01-15T12:03:00.000Z" });
			expect((await store.listByOrder("o1")).map((refund) => refund.id)).toEqual(["r1", "r2"]);
			await store.put({ ...base, id: "r1", orderId: "o1", createdAt: "2026-01-15T12:01:00.000Z", status: "succeeded" });
			expect((await store.get("r1"))?.status).toBe("succeeded");
			expect(await store.get("nope")).toBeNull();
		});
	});
};

// --- Webhook inbox ---------------------------------------------------------------------------------------

const providerEvent = (eventId: string, created = 1_700_000_000): ProviderWebhookEvent => ({
	eventId,
	type: "checkout.session.completed",
	created,
	isLivemode: false,
	action: { kind: "checkout_completed", sessionId: "cs_1" },
	raw: {},
});

export const webhookInboxContract = (name: string, create: () => { inbox: WebhookInbox; clock: FixedClock }): void => {
	describe(`WebhookInbox contract: ${name}`, () => {
		it("records an event once and returns the existing record on a repeat", async () => {
			const { inbox } = create();
			const first = await inbox.record(providerEvent("evt_1"), "{}", "webhook");
			expect(first.isNew).toBe(true);
			expect(first.record).toMatchObject({ eventId: "evt_1", status: "received", attempts: 0, source: "webhook" });
			const second = await inbox.record(providerEvent("evt_1"), "{ other }", "reconcile");
			expect(second).toMatchObject({ isNew: false, record: { payload: "{}", source: "webhook" } });
		});

		it("records a burst of the same event exactly once", async () => {
			const { inbox } = create();
			const results = await Promise.all(Array.from({ length: 8 }, () => inbox.record(providerEvent("evt_1"), "{}", "webhook")));
			expect(results.filter((result) => result.isNew)).toHaveLength(1);
		});

		it("hands the processing lease to one worker, and to another once it expired", async () => {
			const { inbox, clock } = create();
			await inbox.record(providerEvent("evt_1"), "{}", "webhook");
			const claims = await Promise.all(Array.from({ length: 6 }, () => inbox.claim("evt_1", 30_000)));
			expect(claims.filter(Boolean)).toHaveLength(1);
			expect((await inbox.get("evt_1"))?.attempts).toBe(1);
			clock.advance(29_000);
			expect(await inbox.claim("evt_1", 30_000)).toBe(false);
			clock.advance(2_000);
			expect(await inbox.claim("evt_1", 30_000)).toBe(true);
			expect((await inbox.get("evt_1"))?.attempts).toBe(2);
		});

		it("does not claim a missing, processed, ignored or dead event", async () => {
			const { inbox } = create();
			expect(await inbox.claim("nope", 1000)).toBe(false);
			for (const [id, finish] of [
				["done", () => inbox.markProcessed("done")],
				["skip", () => inbox.markIgnored("skip", "foreign")],
				["dead", async () => void (await inbox.markFailed("dead", "boom", null))],
			] as const) {
				await inbox.record(providerEvent(id), "{}", "webhook");
				await finish();
				expect(await inbox.claim(id, 1000)).toBe(false);
			}
			expect(await inbox.get("done")).toMatchObject({ status: "processed", lastError: null });
			expect((await inbox.get("done"))?.processedAt).not.toBeNull();
			expect(await inbox.get("skip")).toMatchObject({ status: "ignored", lastError: "foreign" });
			expect(await inbox.get("dead")).toMatchObject({ status: "dead", lastError: "boom" });
		});

		it("schedules retries: failed events become due at their next attempt, dead ones never", async () => {
			const { inbox, clock } = create();
			await inbox.record(providerEvent("evt_1"), "{}", "webhook");
			await inbox.claim("evt_1", 30_000);
			const failed = await inbox.markFailed("evt_1", "x".repeat(900), iso(clock, 60_000));
			expect(failed.status).toBe("failed");
			expect(failed.lastError!.length).toBeLessThan(600);
			expect(await inbox.listDue(iso(clock), 10)).toEqual([]);
			clock.advance(61_000);
			expect((await inbox.listDue(iso(clock), 10)).map((record) => record.eventId)).toEqual(["evt_1"]);
			expect(await inbox.claim("evt_1", 30_000)).toBe(true);
			await inbox.markFailed("evt_1", "again", null);
			clock.advance(3_600_000);
			expect(await inbox.listDue(iso(clock), 10)).toEqual([]);
		});

		it("leaves a fresh event to the inline attempt for a grace period, then makes it due", async () => {
			const { inbox, clock } = create();
			await inbox.record(providerEvent("evt_1"), "{}", "webhook");
			expect(await inbox.listDue(iso(clock), 10)).toEqual([]);
			clock.advance(3 * 60_000);
			expect((await inbox.listDue(iso(clock), 10)).map((record) => record.eventId)).toEqual(["evt_1"]);
		});

		it("makes an event whose worker died (lease expired) due again", async () => {
			const { inbox, clock } = create();
			await inbox.record(providerEvent("evt_1"), "{}", "webhook");
			await inbox.claim("evt_1", 10_000);
			expect(await inbox.listDue(iso(clock), 10)).toEqual([]);
			clock.advance(11_000);
			expect((await inbox.listDue(iso(clock), 10)).map((record) => record.eventId)).toEqual(["evt_1"]);
		});

		it("requeues a dead or processed event for replay, but not one under a live lease", async () => {
			const { inbox, clock } = create();
			await inbox.record(providerEvent("evt_1"), "{}", "webhook");
			await inbox.markFailed("evt_1", "boom", null);
			expect(await inbox.requeue("evt_1")).toBe(true);
			expect(await inbox.get("evt_1")).toMatchObject({ status: "received", attempts: 0, lastError: null });
			expect((await inbox.listDue(iso(clock), 10)).map((record) => record.eventId)).toEqual(["evt_1"]);
			await inbox.claim("evt_1", 60_000);
			expect(await inbox.requeue("evt_1")).toBe(false);
			expect(await inbox.requeue("missing")).toBe(false);
		});

		it("pages events of one status, newest first", async () => {
			const { inbox, clock } = create();
			for (const id of ["e1", "e2", "e3"]) {
				await inbox.record(providerEvent(id), "{}", "webhook");
				await inbox.markFailed(id, "boom", iso(clock, 1000));
				clock.advance(1000);
			}
			await inbox.record(providerEvent("other"), "{}", "webhook");
			const first = await inbox.listByStatus("failed", 2, null);
			expect(first.items.map((record) => record.eventId)).toEqual(["e3", "e2"]);
			expect(first.cursor).not.toBeNull();
			const second = await inbox.listByStatus("failed", 2, first.cursor);
			expect(second.items.map((record) => record.eventId)).toEqual(["e1"]);
			expect(second.cursor).toBeNull();
		});

		it("keeps a reconciliation cursor that only moves forward", async () => {
			const { inbox } = create();
			expect(await inbox.getCursor()).toBeNull();
			await inbox.setCursor(100);
			await inbox.setCursor(50);
			expect(await inbox.getCursor()).toBe(100);
			await Promise.all([inbox.setCursor(120), inbox.setCursor(110), inbox.setCursor(130)]);
			expect(await inbox.getCursor()).toBe(130);
		});
	});
};

// --- Event outbox ----------------------------------------------------------------------------------------

const event = (id: string): AnyCommerceEvent => ({
	id,
	type: "order.cancelled",
	occurredAt: "2026-01-15T12:00:00.000Z",
	data: { orderId: "o1", orderNumber: "ORD-1" },
});

export const eventOutboxContract = (name: string, create: () => { outbox: EventOutbox; clock: FixedClock }): void => {
	describe(`EventOutbox contract: ${name}`, () => {
		it("enqueues idempotently on the event id, keeping the first delivery state", async () => {
			const { outbox } = create();
			await outbox.enqueue([event("e1")], ["mail"]);
			const first = (await outbox.get("e1"))!;
			await outbox.update({ ...first.value, deliveries: { mail: { status: "delivered", attempts: 1, lastError: null, nextAttemptAt: null } } }, first.revision);
			await outbox.enqueue([event("e1")], ["mail", "other"]);
			expect((await outbox.get("e1"))?.value.deliveries).toEqual({ mail: { status: "delivered", attempts: 1, lastError: null, nextAttemptAt: null } });
		});

		it("rejects an update with a stale revision", async () => {
			const { outbox } = create();
			await outbox.enqueue([event("e1")], ["mail"]);
			const read = (await outbox.get("e1"))!;
			expect((await outbox.update(read.value, read.revision)).applied).toBe(true);
			expect((await outbox.update(read.value, read.revision)).applied).toBe(false);
		});

		it("lists events with a pending or failed delivery that is due, and dead ones separately", async () => {
			const { outbox, clock } = create();
			await outbox.enqueue([event("e-due"), event("e-later"), event("e-done"), event("e-dead")], ["mail"]);
			const set = async (id: string, delivery: { status: "pending" | "delivered" | "failed" | "dead"; nextAttemptAt: string | null }) => {
				const read = (await outbox.get(id))!;
				await outbox.update({ ...read.value, deliveries: { mail: { ...delivery, attempts: 1, lastError: null } } }, read.revision);
			};
			await set("e-later", { status: "failed", nextAttemptAt: iso(clock, 60_000) });
			await set("e-done", { status: "delivered", nextAttemptAt: null });
			await set("e-dead", { status: "dead", nextAttemptAt: null });
			expect((await outbox.listDue(iso(clock), 10)).map((record) => record.event.id)).toEqual(["e-due"]);
			expect((await outbox.listDead(10)).map((record) => record.event.id)).toEqual(["e-dead"]);
			clock.advance(61_000);
			expect((await outbox.listDue(iso(clock), 10)).map((record) => record.event.id).sort()).toEqual(["e-due", "e-later"]);
		});
	});
};

// --- Rate limiter ----------------------------------------------------------------------------------------

export const rateLimiterContract = (name: string, create: () => { limiter: RateLimiter; clock: FixedClock }): void => {
	describe(`RateLimiter contract: ${name}`, () => {
		it("allows `limit` hits per window and rejects the rest, per key", async () => {
			const { limiter } = create();
			const results: boolean[] = [];
			for (let index = 0; index < 5; index += 1) results.push(await limiter.hit("ip:1", 3, 60_000));
			expect(results).toEqual([true, true, true, false, false]);
			expect(await limiter.hit("ip:2", 3, 60_000)).toBe(true);
		});

		it("starts a new window after the old one ends", async () => {
			const { limiter, clock } = create();
			clock.set("2026-01-15T12:00:10.000Z");
			for (let index = 0; index < 2; index += 1) await limiter.hit("k", 2, 60_000);
			expect(await limiter.hit("k", 2, 60_000)).toBe(false);
			clock.set("2026-01-15T12:01:00.000Z");
			expect(await limiter.hit("k", 2, 60_000)).toBe(true);
		});

		it("never lets concurrent callers exceed the limit", async () => {
			const { limiter } = create();
			const results = await Promise.all(Array.from({ length: 20 }, () => limiter.hit("k", 5, 60_000)));
			expect(results.filter(Boolean)).toHaveLength(5);
		});
	});
};
