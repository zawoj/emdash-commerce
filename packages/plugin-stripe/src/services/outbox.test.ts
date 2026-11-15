import { afterEach, describe, expect, it, vi } from "vitest";

import { defineSubscriber, type EventSubscriber } from "../contracts/extensions.js";
import type { AnyCommerceEvent, CommerceEventType } from "../core/events.js";
import { commerceEventId } from "../core/events.js";
import { createEventPublisher, OUTBOX_MAX_ATTEMPTS } from "./outbox.js";
import { createExtensionContext } from "./extension-context.js";
import { advance, createHarness, pln } from "./payments/test-support.js";

const orderPaid = (id: string): AnyCommerceEvent => ({
	id: commerceEventId("order.paid", id),
	type: "order.paid",
	occurredAt: "2026-01-15T12:00:00.000Z",
	data: { orderId: id, orderNumber: "ORD-1", amount: 100, currency: pln },
});

const harnessWith = (subscribers: readonly EventSubscriber<CommerceEventType>[]) => {
	const h = createHarness({ extensions: { subscribers } });
	return { h, publisher: createEventPublisher(h.container) };
};

const recorder = (id: string, events: readonly CommerceEventType[] = ["order.paid"]) => {
	const seen: string[] = [];
	const subscriber = defineSubscriber({ id, events, handle: async (event) => void seen.push(event.id) });
	return { subscriber: subscriber as EventSubscriber<CommerceEventType>, seen };
};

afterEach(() => vi.useRealTimers());

describe("event publisher", () => {
	it("delivers inline to subscribers of that event type only, and records the delivery", async () => {
		const a = recorder("a");
		const b = recorder("b", ["order.created"]);
		const { h, publisher } = harnessWith([a.subscriber, b.subscriber]);
		await publisher.publish([orderPaid("o1")]);
		expect(a.seen).toEqual(["order.paid:o1"]);
		expect(b.seen).toEqual([]);
		const stored = (await h.container.outbox.get("order.paid:o1"))!.value;
		// The built-in email subscriber is interested in order.paid as well; b (order.created) is not.
		expect(Object.keys(stored.deliveries).sort()).toEqual(["a", "builtin-emails"]);
		expect(stored.deliveries.a).toMatchObject({ status: "delivered", attempts: 1, lastError: null, nextAttemptAt: null });
	});

	it("is idempotent on the event id: a re-published event is not delivered again", async () => {
		const a = recorder("a");
		const { publisher } = harnessWith([a.subscriber]);
		await publisher.publish([orderPaid("o1")]);
		await publisher.publish([orderPaid("o1"), orderPaid("o1")]);
		await publisher.processDue(10);
		expect(a.seen).toEqual(["order.paid:o1"]);
	});

	it("never throws for a failing subscriber and keeps the others delivering", async () => {
		const good = recorder("good");
		const bad = defineSubscriber({ id: "bad", events: ["order.paid"], handle: async () => { throw new Error("boom"); } });
		const syncBad = defineSubscriber({ id: "sync-bad", events: ["order.paid"], handle: () => { throw new Error("sync boom"); } });
		const { h, publisher } = harnessWith([bad as EventSubscriber<CommerceEventType>, syncBad as EventSubscriber<CommerceEventType>, good.subscriber]);
		await expect(publisher.publish([orderPaid("o1")])).resolves.toBeUndefined();
		expect(good.seen).toHaveLength(1);
		const { deliveries } = (await h.container.outbox.get("order.paid:o1"))!.value;
		expect(deliveries.good!.status).toBe("delivered");
		expect(deliveries.bad).toMatchObject({ status: "failed", attempts: 1, lastError: "boom" });
		expect(deliveries["sync-bad"]).toMatchObject({ status: "failed", lastError: "sync boom" });
		expect(deliveries.bad!.nextAttemptAt! > h.container.clock.now().toISOString()).toBe(true);
	});

	it("retries a failed delivery from cron once its backoff has elapsed, and only then", async () => {
		let attempts = 0;
		const flaky = defineSubscriber({ id: "flaky", events: ["order.paid"], handle: async () => { if (++attempts < 3) throw new Error("not yet"); } });
		const { h, publisher } = harnessWith([flaky as EventSubscriber<CommerceEventType>]);
		await publisher.publish([orderPaid("o1")]);
		expect(await publisher.processDue(10)).toBe(0);
		advance(h, 31_000);
		expect(await publisher.processDue(10)).toBe(1);
		expect(await publisher.processDue(10)).toBe(0);
		advance(h, 5 * 60_000);
		expect(await publisher.processDue(10)).toBe(1);
		expect(attempts).toBe(3);
		expect((await h.container.outbox.get("order.paid:o1"))!.value.deliveries.flaky!.status).toBe("delivered");
		advance(h, 24 * 60 * 60_000);
		expect(await publisher.processDue(10)).toBe(0);
	});

	it("parks a delivery as dead after the maximum attempts, then retry revives and delivers it", async () => {
		let shouldFail = true;
		let calls = 0;
		const sub = defineSubscriber({ id: "stubborn", events: ["order.paid"], handle: async () => { calls += 1; if (shouldFail) throw new Error("down"); } });
		const { h, publisher } = harnessWith([sub as EventSubscriber<CommerceEventType>]);
		await publisher.publish([orderPaid("o1")]);
		for (let round = 0; round < OUTBOX_MAX_ATTEMPTS + 2; round += 1) {
			advance(h, 7 * 60 * 60_000);
			await publisher.processDue(10);
		}
		expect(calls).toBe(OUTBOX_MAX_ATTEMPTS);
		expect((await h.container.outbox.get("order.paid:o1"))!.value.deliveries.stubborn).toMatchObject({ status: "dead", attempts: OUTBOX_MAX_ATTEMPTS, nextAttemptAt: null });
		expect(await h.container.outbox.listDead(10)).toHaveLength(1);

		shouldFail = false;
		await publisher.retry("order.paid:o1");
		expect((await h.container.outbox.get("order.paid:o1"))!.value.deliveries.stubborn).toMatchObject({ status: "delivered", attempts: 1 });
		expect(await h.container.outbox.listDead(10)).toHaveLength(0);
		await expect(publisher.retry("missing")).rejects.toMatchObject({ kind: "notFound" });
	});

	it("treats a subscriber that takes longer than 5 seconds as failed", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		const slow = defineSubscriber({ id: "slow", events: ["order.paid"], handle: () => new Promise<void>(() => undefined) });
		const { h, publisher } = harnessWith([slow as EventSubscriber<CommerceEventType>]);
		const publishing = publisher.publish([orderPaid("o1")]);
		await vi.advanceTimersByTimeAsync(4_900);
		expect((await h.container.outbox.get("order.paid:o1"))!.value.deliveries.slow!.status).toBe("pending");
		await vi.advanceTimersByTimeAsync(200);
		await publishing;
		expect((await h.container.outbox.get("order.paid:o1"))!.value.deliveries.slow).toMatchObject({ status: "failed", lastError: expect.stringContaining("timed out after 5000 ms") });
	});

	it("leases a delivery, so two workers racing deliver once", async () => {
		const a = recorder("a");
		const { h, publisher } = harnessWith([a.subscriber]);
		await h.container.outbox.enqueue([orderPaid("o1")], ["a"]);
		await Promise.all([publisher.processDue(10), publisher.processDue(10), publisher.processDue(10)]);
		expect(a.seen).toEqual(["order.paid:o1"]);
	});

	it("gives a lost lease back: a worker that died is retried after the lease expires", async () => {
		const a = recorder("a");
		const { h, publisher } = harnessWith([a.subscriber]);
		await h.container.outbox.enqueue([orderPaid("o1")], ["a"]);
		const found = (await h.container.outbox.get("order.paid:o1"))!;
		await h.container.outbox.update({ ...found.value, deliveries: { a: { ...found.value.deliveries.a!, nextAttemptAt: new Date(h.container.clock.now().getTime() + 60_000).toISOString() } } }, found.revision);
		expect(await publisher.processDue(10)).toBe(0);
		advance(h, 61_000);
		expect(await publisher.processDue(10)).toBe(1);
		expect(a.seen).toHaveLength(1);
	});

	it("does not wedge on a subscriber that disappeared after the event was written", async () => {
		const gone = recorder("gone");
		const h = createHarness({ extensions: { subscribers: [gone.subscriber] } });
		await h.container.outbox.enqueue([orderPaid("o1")], ["gone"]);
		const publisher = createEventPublisher(createHarnessWithout(h));
		for (let round = 0; round < OUTBOX_MAX_ATTEMPTS + 1; round += 1) {
			advance(h, 7 * 60 * 60_000);
			await publisher.processDue(10);
		}
		expect((await h.container.outbox.get("order.paid:o1"))!.value.deliveries.gone).toMatchObject({ status: "dead", lastError: "Subscriber is not registered" });
	});

	it("ignores a second subscriber that reuses an id", async () => {
		const first = recorder("same");
		const second = recorder("same");
		const { publisher } = harnessWith([first.subscriber, second.subscriber]);
		await publisher.publish([orderPaid("o1")]);
		expect(first.seen).toHaveLength(1);
		expect(second.seen).toHaveLength(0);
	});

	it("hands subscribers a read-only context", async () => {
		const seen: unknown[] = [];
		const sub = defineSubscriber({ id: "ctx", events: ["order.paid"], handle: async (_event, ctx) => void seen.push(await ctx.getOrder("nope"), ctx.storeName, ctx.siteUrl, Object.keys(ctx).sort()) });
		const { publisher } = harnessWith([sub as EventSubscriber<CommerceEventType>]);
		await publisher.publish([orderPaid("o1")]);
		expect(seen).toEqual([null, "Store", "https://shop.example", ["getCustomer", "getOrder", "getSubscription", "log", "siteUrl", "storeName"]]);
		expect(createExtensionContext(createHarness().container).getSubscription).toBeTypeOf("function");
	});
});

/** A container for the same stores whose extensions no longer list any subscriber. */
const createHarnessWithout = (h: ReturnType<typeof createHarness>) => ({ ...h.container, extensions: {} });
