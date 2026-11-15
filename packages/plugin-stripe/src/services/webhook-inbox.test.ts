import { describe, expect, it, vi } from "vitest";

import { INBOX_LEASE_MS, INBOX_OUTCOME, processDueInbox, processInboxEvent, replayInboxEvent, serializeEvent } from "./webhook-inbox.js";
import { advance, allOrders, completeCheckout, createHarness, event, seedCheckout } from "./payments/test-support.js";
import type { ProviderWebhookEvent } from "../ports/payment-provider.js";

const unsupported = (): ProviderWebhookEvent => event({ kind: "unsupported" }, { type: "charge.succeeded" });

describe("inbox pipeline", () => {
	it("marks an unsupported event ignored and keeps the raw payload", async () => {
		const h = createHarness();
		const evt = { ...unsupported(), raw: { id: "evt_raw", data: { a: 1 } } };
		expect((await h.deliver(evt)).outcome).toBe("ignored");
		const stored = (await h.container.inbox.get(evt.eventId))!;
		expect(stored).toMatchObject({ status: "ignored", type: "charge.succeeded" });
		expect(JSON.parse(stored.payload).raw).toEqual({ id: "evt_raw", data: { a: 1 } });
	});

	it("does not process an event twice, and reports another worker's lease as busy", async () => {
		const h = createHarness();
		const evt = unsupported();
		await h.deliver(evt);
		expect((await processInboxEvent(h.container, evt.eventId)).outcome).toBe(INBOX_OUTCOME.duplicate);
		const leased = unsupported();
		await h.container.inbox.record(leased, serializeEvent(leased), "webhook");
		await h.container.inbox.claim(leased.eventId, INBOX_LEASE_MS);
		expect((await processInboxEvent(h.container, leased.eventId)).outcome).toBe(INBOX_OUTCOME.busy);
		expect((await processInboxEvent(h.container, "evt_missing")).outcome).toBe(INBOX_OUTCOME.missing);
	});

	it("takes over an event whose worker died once the lease has expired", async () => {
		const h = createHarness();
		const evt = unsupported();
		await h.container.inbox.record(evt, serializeEvent(evt), "webhook");
		await h.container.inbox.claim(evt.eventId, INBOX_LEASE_MS);
		advance(h, INBOX_LEASE_MS + 1_000);
		expect((await processDueInbox(h.container, 10)).ignored).toBe(1);
	});

	it("parks an unreadable payload as dead immediately", async () => {
		const h = createHarness();
		const evt = unsupported();
		await h.container.inbox.record(evt, "{not json", "webhook");
		expect((await processInboxEvent(h.container, evt.eventId)).outcome).toBe(INBOX_OUTCOME.dead);
		expect((await h.container.inbox.get(evt.eventId))!.status).toBe("dead");
	});

	it("backs off exponentially, parks the event as dead at the limit, and a replay then processes it", async () => {
		const h = createHarness({ options: { webhooks: { maxAttempts: 3 } } });
		const seeded = await seedCheckout(h);
		const completed = completeCheckout(h, seeded);
		for (let index = 0; index < 3; index += 1) h.provider.failNext("retrieveSession");

		expect((await h.deliver(completed)).outcome).toBe("failed");
		let record = (await h.container.inbox.get(completed.eventId))!;
		expect(record).toMatchObject({ status: "failed", attempts: 1 });
		const first = new Date(record.nextAttemptAt!).getTime() - h.container.clock.now().getTime();
		expect(first).toBe(30_000);
		expect((await processDueInbox(h.container, 10)).attempted).toBe(0);

		advance(h, 30_000);
		expect((await processDueInbox(h.container, 10)).failed).toBe(1);
		record = (await h.container.inbox.get(completed.eventId))!;
		expect(new Date(record.nextAttemptAt!).getTime() - h.container.clock.now().getTime()).toBe(120_000);

		advance(h, 120_000);
		expect(await processDueInbox(h.container, 10)).toMatchObject({ dead: 1, attempted: 1 });
		expect(await h.container.inbox.get(completed.eventId)).toMatchObject({ status: "dead", attempts: 3, nextAttemptAt: null });
		advance(h, 30 * 24 * 3600_000);
		expect((await processDueInbox(h.container, 10)).attempted).toBe(0);
		expect(await allOrders(h)).toHaveLength(0);

		expect((await replayInboxEvent(h.container, completed.eventId)).outcome).toBe("processed");
		expect(await allOrders(h)).toHaveLength(1);
		expect(await h.container.inbox.get(completed.eventId)).toMatchObject({ status: "processed", attempts: 1 });
		await expect(replayInboxEvent(h.container, "evt_nope")).rejects.toMatchObject({ kind: "notFound" });
	});

	it("refuses to replay an event that is being processed right now", async () => {
		const h = createHarness();
		const evt = unsupported();
		await h.container.inbox.record(evt, serializeEvent(evt), "webhook");
		await h.container.inbox.claim(evt.eventId, INBOX_LEASE_MS);
		await expect(replayInboxEvent(h.container, evt.eventId)).rejects.toMatchObject({ kind: "conflict" });
	});
});

describe("stripeWebhooks extensions", () => {
	it("run after the built-in handling, the specific type first and then the wildcard, with the raw event", async () => {
		const calls: Array<{ key: string; hasOrder: boolean; raw: unknown }> = [];
		let harness: ReturnType<typeof createHarness>;
		const make = (key: string) => async (raw: unknown) => {
			calls.push({ key, hasOrder: (await allOrders(harness)).length === 1, raw });
		};
		harness = createHarness({ extensions: { stripeWebhooks: { "*": make("*"), "checkout.session.completed": make("specific"), "invoice.paid": make("other") } } });
		const seeded = await seedCheckout(harness);
		const completed = { ...completeCheckout(harness, seeded), raw: { id: "evt_raw_1", type: "checkout.session.completed" } };
		expect((await harness.deliver(completed)).outcome).toBe("processed");
		expect(calls.map((call) => call.key)).toEqual(["specific", "*"]);
		expect(calls.every((call) => call.hasOrder)).toBe(true);
		expect(calls[0]!.raw).toEqual({ id: "evt_raw_1", type: "checkout.session.completed" });
	});

	it("also see events the built-in handlers ignore", async () => {
		const seen: unknown[] = [];
		const h = createHarness({ extensions: { stripeWebhooks: { "charge.succeeded": async (raw) => void seen.push(raw) } } });
		expect((await h.deliver({ ...unsupported(), raw: { id: "evt_x" } })).outcome).toBe("ignored");
		expect(seen).toEqual([{ id: "evt_x" }]);
	});

	it("retry the whole event when one fails, without repeating the built-in effects", async () => {
		let shouldFail = true;
		let calls = 0;
		const h = createHarness({ extensions: { stripeWebhooks: { "checkout.session.completed": async () => { calls += 1; if (shouldFail) throw new Error("site hook down"); } } } });
		const seeded = await seedCheckout(h);
		const completed = completeCheckout(h, seeded);
		const first = await h.deliver(completed);
		expect(first).toMatchObject({ outcome: "failed", error: "site hook down" });
		expect(await allOrders(h)).toHaveLength(1);

		shouldFail = false;
		advance(h, 60_000);
		expect((await processDueInbox(h.container, 10)).processed).toBe(1);
		expect(calls).toBe(2);
		expect(await allOrders(h)).toHaveLength(1);
		expect(await h.container.inventory.get(seeded.sellable)).toMatchObject({ onHand: 8, reserved: 0 });
	});

	it("time out instead of holding the event forever", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		try {
			const h = createHarness({ extensions: { stripeWebhooks: { "charge.succeeded": () => new Promise<void>(() => undefined) } } });
			const pending = h.deliver(unsupported());
			await vi.advanceTimersByTimeAsync(10_100);
			expect(await pending).toMatchObject({ outcome: "failed", error: expect.stringContaining("timed out") });
		} finally {
			vi.useRealTimers();
		}
	});
});
