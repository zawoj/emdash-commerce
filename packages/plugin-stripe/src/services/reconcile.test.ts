import { describe, expect, it } from "vitest";

import { WEBHOOK_EVENT_TYPES } from "../adapters/stripe/webhook-events.js";
import { RECONCILE_MAX_NEW_EVENTS, RECONCILE_OVERLAP_SECONDS, reconcile } from "./reconcile.js";
import { allOrders, completeCheckout, createHarness, event, seedCheckout, type Harness } from "./payments/test-support.js";

const nowSeconds = (h: Harness): number => Math.floor(h.container.clock.now().getTime() / 1000);

describe("reconcile", () => {
	it("picks up a missed event once and records it as a reconcile event", async () => {
		const h = createHarness();
		const seeded = await seedCheckout(h);
		const missed = { ...completeCheckout(h, seeded), created: nowSeconds(h) - 120 };
		h.provider.recordEvent(missed);

		const first = await reconcile(h.container);
		expect(first).toMatchObject({ scanned: 1, recorded: 1, processed: 1, failed: 0, isTruncated: false });
		expect(await allOrders(h)).toHaveLength(1);
		expect((await h.container.inbox.get(missed.eventId))!).toMatchObject({ status: "processed", source: "reconcile" });
		expect(h.provider.callsOf("listEventsSince")[0]!.args).toEqual({ createdAfter: nowSeconds(h) - 3600, types: WEBHOOK_EVENT_TYPES });

		const second = await reconcile(h.container);
		expect(second).toMatchObject({ recorded: 0, processed: 0 });
		expect(await allOrders(h)).toHaveLength(1);
		expect(h.provider.callsOf("createRefund")).toHaveLength(0);
	});

	it("skips events the webhook already delivered", async () => {
		const h = createHarness();
		const seeded = await seedCheckout(h);
		const delivered = { ...completeCheckout(h, seeded), created: nowSeconds(h) - 10 };
		await h.deliver(delivered);
		h.provider.recordEvent(delivered);
		const result = await reconcile(h.container);
		expect(result).toMatchObject({ scanned: 1, recorded: 0 });
		expect((await h.container.inbox.get(delivered.eventId))!.source).toBe("webhook");
	});

	it("advances the cursor monotonically and re-lists with an overlap", async () => {
		const h = createHarness();
		const base = nowSeconds(h);
		for (const [index, created] of [base - 500, base - 400, base - 300].entries()) {
			h.provider.recordEvent(event({ kind: "unsupported" }, { type: "payment_intent.succeeded", eventId: `evt_old_${index}`, created }));
		}
		await reconcile(h.container);
		expect(await h.container.inbox.getCursor()).toBe(base - 300);
		await reconcile(h.container, { since: base - 1000 });
		expect(await h.container.inbox.getCursor()).toBe(base - 300);
		await reconcile(h.container);
		expect(h.provider.callsOf("listEventsSince").at(-1)!.args).toMatchObject({ createdAfter: base - 300 - RECONCILE_OVERLAP_SECONDS });
	});

	it("honours an explicit since, and is bounded per run so a long outage catches up over several", async () => {
		const h = createHarness();
		const base = nowSeconds(h);
		const total = RECONCILE_MAX_NEW_EVENTS + 30;
		for (let index = 0; index < total; index += 1) {
			h.provider.recordEvent(event({ kind: "unsupported" }, { type: "payment_intent.succeeded", eventId: `evt_many_${index}`, created: base - 10_000 + index }));
		}
		const first = await reconcile(h.container, { since: base - 20_000 });
		expect(first).toMatchObject({ recorded: RECONCILE_MAX_NEW_EVENTS, isTruncated: true, since: base - 20_000 });
		const second = await reconcile(h.container);
		expect(second).toMatchObject({ recorded: 30, isTruncated: false });
		expect(await h.container.inbox.getCursor()).toBe(base - 10_000 + total - 1);
	});

	it("keeps a failing event for the retry sweep and still moves on", async () => {
		const h = createHarness();
		const seeded = await seedCheckout(h);
		h.provider.recordEvent({ ...completeCheckout(h, seeded), created: nowSeconds(h) - 50 });
		h.provider.failNext("retrieveSession");
		const result = await reconcile(h.container);
		expect(result).toMatchObject({ recorded: 1, failed: 1 });
		expect((await h.container.inbox.listByStatus("failed", 10, null)).items).toHaveLength(1);
	});
});
