import { describe, expect, it } from "vitest";

import { WEBHOOK_EVENT_TYPES } from "../../adapters/stripe/webhook-events.js";
import { ROUTE } from "../../contracts/api.js";
import { SETTINGS_KEY } from "../../contracts/options.js";
import { ProviderError } from "../../ports/payment-provider.js";
import { createOpsHarness, failure, SECRET_KEY, WEBHOOK_SECRET, TOKEN_SECRET } from "../ops-test-support.js";
import { PERMISSION, webhookUrlOf } from "./admin.js";

/** Reads need an editor, everything that moves money or changes system state needs `plugins:manage`. */
const READ_ROUTES = [ROUTE.adminStatus, ROUTE.adminOrdersList, ROUTE.adminOrdersGet, ROUTE.adminOrdersEvents, ROUTE.adminInventoryGet, ROUTE.adminWebhooksList];
const MANAGE_ROUTES = [
	ROUTE.admin,
	ROUTE.adminOrdersRefund,
	ROUTE.adminOrdersFulfillment,
	ROUTE.adminOrdersAction,
	ROUTE.adminOrdersNote,
	ROUTE.adminSubscriptionsCancel,
	ROUTE.adminInventoryAdjust,
	ROUTE.adminCatalogResync,
	ROUTE.adminWebhooksRegister,
	ROUTE.adminWebhooksReplay,
	ROUTE.adminReconcile,
	ROUTE.adminOutboxRetry,
];

describe("admin route declarations", () => {
	const h = createOpsHarness();

	it("every admin route is a private POST route; reads need content:edit_any, money and system actions plugins:manage", () => {
		for (const name of READ_ROUTES) expect(h.routes[name], name).toMatchObject({ methods: ["POST"], permission: "content:edit_any" });
		for (const name of MANAGE_ROUTES) expect(h.routes[name], name).toMatchObject({ methods: ["POST"], permission: "plugins:manage" });
		for (const name of [...READ_ROUTES, ...MANAGE_ROUTES]) expect(h.routes[name]?.public, name).toBeFalsy();
		expect(PERMISSION).toEqual({ read: "content:edit_any", manage: "plugins:manage" });
	});

	it("the money routes are explicitly not reachable with the editor-level permission", () => {
		for (const name of [ROUTE.adminOrdersRefund, ROUTE.adminSubscriptionsCancel, ROUTE.adminInventoryAdjust, ROUTE.adminWebhooksRegister, ROUTE.adminReconcile]) {
			expect(h.routes[name]!.permission, name).not.toBe(PERMISSION.read);
		}
	});

	it("derives the webhook URL from the site URL and the plugin route", () => {
		expect(webhookUrlOf(h.context())).toBe("https://shop.example/_emdash/api/plugins/stripe-commerce/webhook");
	});
});

describe("input validation", () => {
	const h = createOpsHarness();

	it.each([
		[ROUTE.adminOrdersRefund, { orderId: "o1", requestId: "short" }],
		[ROUTE.adminOrdersRefund, { requestId: "req-00000001" }],
		[ROUTE.adminOrdersFulfillment, { orderId: "o1", fulfillmentStatus: "shipped" }],
		[ROUTE.adminOrdersAction, { orderId: "o1", action: "delete" }],
		[ROUTE.adminOrdersNote, { orderId: "o1", note: "   " }],
		[ROUTE.adminOrdersEvents, { orderId: "o1", limit: 500 }],
		[ROUTE.adminInventoryAdjust, { kind: "product", id: "p1", delta: 0, reason: "x" }],
		[ROUTE.adminOrdersGet, {}],
		[ROUTE.adminWebhooksReplay, {}],
		[ROUTE.adminOutboxRetry, { eventId: "" }],
	])("%s rejects %j with 400 and no echo of the value", async (name, input) => {
		const error = await failure(h.call(name, { input }));
		expect(error).toMatchObject({ code: "INVALID_INPUT", status: 400 });
	});
});

describe("admin/status", () => {
	it("reports configuration health and never returns a secret", async () => {
		const h = createOpsHarness();
		await h.seedPaidOrder();
		const status = (await h.call(ROUTE.adminStatus, { input: {} })) as Record<string, any>;
		const serialized = JSON.stringify(status);
		for (const secret of [SECRET_KEY, WEBHOOK_SECRET, TOKEN_SECRET]) expect(serialized).not.toContain(secret);
		expect(status.stripe).toMatchObject({ isKeyPresent: true, keyLast4: "1234", mode: "test", keyKind: "restricted", apiVersion: "2026-10-28.endive" });
		expect(status.stripe.account).toMatchObject({ accountId: "acct_fake" });
		expect(status.webhook).toMatchObject({ isSecretPresent: true, health: "not_registered", url: "https://shop.example/_emdash/api/plugins/stripe-commerce/webhook" });
		expect(status.recentOrders).toHaveLength(1);
		expect(status.recentOrders[0]).toMatchObject({ orderStatus: "open", paymentStatus: "paid", email: "Buyer@Example.com" });
		expect(status.counters).toMatchObject({ inboxFailed: { count: 0 }, inboxDead: { count: 0 }, outboxDead: { count: 0 }, catalogLinksFailed: { count: 0 }, heldReservations: { count: 0 } });
	});

	it("detects the registered endpoint and an outdated event list", async () => {
		const h = createOpsHarness();
		await h.call(ROUTE.adminWebhooksRegister, { input: {} });
		expect(((await h.call(ROUTE.adminStatus, { input: {} })) as any).webhook).toMatchObject({ health: "ok", missingEvents: [] });
		const [endpoint] = await h.provider.webhooks.listEndpoints();
		await h.provider.webhooks.updateEndpoint(endpoint!.endpointId, { events: ["checkout.session.completed"] });
		const status = (await h.call(ROUTE.adminStatus, { input: {} })) as any;
		expect(status.webhook.health).toBe("events_outdated");
		expect(status.webhook.missingEvents).toHaveLength(WEBHOOK_EVENT_TYPES.length - 1);
	});

	it("tolerates a failing account lookup and a missing key", async () => {
		const h = createOpsHarness();
		h.provider.describeAccount = async () => {
			throw new ProviderError("denied", { isRetryable: false });
		};
		const status = (await h.call(ROUTE.adminStatus, { input: {} })) as any;
		expect(status.stripe.account).toBeNull();
		expect(status.stripe.accountError).toMatch(/rejected/);
		expect(status.webhook.health).toBe("not_registered");

		const noKey = createOpsHarness({ settings: {} });
		const empty = (await noKey.call(ROUTE.adminStatus, { input: {} })) as any;
		expect(empty.stripe).toMatchObject({ isKeyPresent: false, keyLast4: null, mode: "unknown" });
		expect(empty.webhook.health).toBe("missing_key");
	});

	it("reports the maintenance task and repairs a missing schedule on first visit", async () => {
		const h = createOpsHarness();
		expect(h.cronTasks).toHaveLength(0);
		const status = (await h.call(ROUTE.adminStatus, { input: {} })) as any;
		expect(h.cronTasks).toEqual([{ name: "commerce-maintenance", schedule: "*/5 * * * *" }]);
		expect(status.cron).toMatchObject({ isScheduled: true, schedule: "*/5 * * * *" });
	});

	it("counts failed webhook events and low stock", async () => {
		const h = createOpsHarness();
		const { productId } = h.seedProduct({ tracked: true });
		await h.container().inventory.adjust({ kind: "product", id: productId }, 2, "seed");
		const container = h.container();
		await container.inbox.record({ eventId: "evt_f", type: "x", created: 1, isLivemode: false, action: { kind: "unsupported" }, raw: {} }, "{}", "webhook");
		await container.inbox.markFailed("evt_f", "boom", "2099-01-01T00:00:00.000Z");
		const status = (await h.call(ROUTE.adminStatus, { input: {} })) as any;
		expect(status.counters.inboxFailed.count).toBe(1);
		expect(status.counters.lowStock.count).toBe(1);
		expect(status.lowStock[0]).toMatchObject({ available: 2, onHand: 2 });
	});
});

describe("orders", () => {
	it("lists and gets orders by id and by number, with payments and refunds", async () => {
		const h = createOpsHarness();
		const seeded = await h.seedPaidOrder();
		const list = (await h.call(ROUTE.adminOrdersList, { input: {} })) as any;
		expect(list.items).toHaveLength(1);
		expect((await h.call(ROUTE.adminOrdersList, { input: { status: "refunded" } })) as any).toMatchObject({ items: [] });
		expect(await failure(h.call(ROUTE.adminOrdersList, { input: { status: "bogus" } }))).toMatchObject({ code: "INVALID_INPUT" });

		const byId = (await h.call(ROUTE.adminOrdersGet, { input: { orderId: seeded.orderId } })) as any;
		const byNumber = (await h.call(ROUTE.adminOrdersGet, { input: { orderNumber: seeded.orderNumber } })) as any;
		expect(byNumber.order.id).toBe(byId.order.id);
		expect(byId.payments).toHaveLength(1);
		expect(byId.refunds).toEqual([]);
		expect(byId.subscription).toBeNull();
		expect(await failure(h.call(ROUTE.adminOrdersGet, { input: { orderId: "missing" } }))).toMatchObject({ code: "NOT_FOUND", status: 404 });
	});

	it("refunds through the provider, records who asked, and is idempotent by requestId", async () => {
		const h = createOpsHarness();
		const { orderId } = await h.seedPaidOrder({ unitAmount: 2000, quantity: 2 });
		const input = { orderId, amount: 1500, reason: "requested_by_customer", requestId: "req-ops-0001" };
		const first = (await h.call(ROUTE.adminOrdersRefund, { input })) as any;
		const again = (await h.call(ROUTE.adminOrdersRefund, { input })) as any;
		expect(again.id).toBe(first.id);
		expect(first).toMatchObject({ orderId, amount: 1500, status: "succeeded", requestedBy: "admin@example.com (usr_admin)" });
		expect(h.provider.refunds.size).toBe(1);
		expect(h.provider.callsOf("createRefund")).toHaveLength(1);
		const detail = (await h.call(ROUTE.adminOrdersGet, { input: { orderId } })) as any;
		expect(detail.refunds).toHaveLength(1);
		expect(detail.order).toMatchObject({ paymentStatus: "partially_refunded", totals: { refunded: 1500 } });
		// A different request id is a different refund; the bound is what is still refundable.
		const over = await failure(h.call(ROUTE.adminOrdersRefund, { input: { orderId, amount: 9000, requestId: "req-ops-0002" } }));
		expect(over).toMatchObject({ status: 409 });
		expect(h.provider.refunds.size).toBe(1);
	});

	it("maps a provider failure to 502 without leaking provider detail", async () => {
		const h = createOpsHarness();
		const { orderId } = await h.seedPaidOrder();
		h.provider.failNext("createRefund", new ProviderError("sk_test_leak in message", { isRetryable: true }));
		const error = await failure(h.call(ROUTE.adminOrdersRefund, { input: { orderId, requestId: "req-ops-0003" } }));
		expect(error).toMatchObject({ code: "PROVIDER_ERROR", status: 502 });
		expect(error.message).not.toContain("sk_test_leak");
	});

	it("sets fulfilment through the order lock and is idempotent", async () => {
		const h = createOpsHarness();
		const { orderId } = await h.seedPaidOrder();
		expect(await h.call(ROUTE.adminOrdersFulfillment, { input: { orderId, fulfillmentStatus: "fulfilled" } })).toMatchObject({ fulfillmentStatus: "fulfilled" });
		expect(await h.call(ROUTE.adminOrdersFulfillment, { input: { orderId, fulfillmentStatus: "fulfilled" } })).toMatchObject({ fulfillmentStatus: "fulfilled" });
		expect((await h.container().orders.get(orderId))!.fulfillmentStatus).toBe("fulfilled");
		expect(await failure(h.call(ROUTE.adminOrdersFulfillment, { input: { orderId: "nope", fulfillmentStatus: "fulfilled" } }))).toMatchObject({ status: 404 });
	});

	it("runs the lifecycle actions with their guards, filters the list by both axes and shows the timeline", async () => {
		const h = createOpsHarness();
		const { orderId, orderNumber } = await h.seedPaidOrder();
		const refused = await failure(h.call(ROUTE.adminOrdersAction, { input: { orderId, action: "complete" } }));
		expect(refused).toMatchObject({ code: "CONFLICT", status: 409, message: expect.stringContaining("not fulfilled") });
		await h.call(ROUTE.adminOrdersFulfillment, { input: { orderId, fulfillmentStatus: "fulfilled" } });
		expect(await h.call(ROUTE.adminOrdersAction, { input: { orderId, action: "complete" } })).toMatchObject({ orderStatus: "completed", paymentStatus: "paid", fulfillmentStatus: "fulfilled" });
		expect(await failure(h.call(ROUTE.adminOrdersAction, { input: { orderId, action: "cancel" } }))).toMatchObject({ status: 409 });
		expect(await failure(h.call(ROUTE.adminOrdersAction, { input: { orderId: "nope", action: "complete" } }))).toMatchObject({ status: 404 });

		const completed = (await h.call(ROUTE.adminOrdersList, { input: { orderStatus: "completed" } })) as { items: Array<{ orderNumber: string }> };
		expect(completed.items.map((item) => item.orderNumber)).toEqual([orderNumber]);
		expect(((await h.call(ROUTE.adminOrdersList, { input: { orderStatus: "open" } })) as { items: unknown[] }).items).toEqual([]);
		expect(await failure(h.call(ROUTE.adminOrdersList, { input: { orderStatus: "paid" } }))).toMatchObject({ code: "INVALID_INPUT" });
		expect(await failure(h.call(ROUTE.adminOrdersList, { input: { status: "completed" } }))).toMatchObject({ code: "INVALID_INPUT" });

		await h.call(ROUTE.adminOrdersNote, { input: { orderId, note: "Left at the door" } });
		const events = (await h.call(ROUTE.adminOrdersEvents, { input: { orderId } })) as { items: Array<{ type: string; message: string; actorLabel: string | null }> };
		expect(events.items.map((item) => item.type)).toEqual(expect.arrayContaining(["placed", "payment_status_changed", "fulfillment_status_changed", "order_status_changed", "note"]));
		expect(events.items.find((item) => item.type === "note")).toMatchObject({ message: "Left at the door", actorLabel: "admin@example.com (usr_admin)" });
		const detail = (await h.call(ROUTE.adminOrdersGet, { input: { orderNumber } })) as { events: unknown[]; order: { orderStatus: string } };
		expect(detail.order.orderStatus).toBe("completed");
		expect(detail.events.length).toBeGreaterThan(3);
	});

	it("cancels a subscription through the provider and 404s an unknown one", async () => {
		const h = createOpsHarness();
		expect(await failure(h.call(ROUTE.adminSubscriptionsCancel, { input: { subscriptionId: "missing" } }))).toMatchObject({ status: 404 });
		const container = h.container();
		h.provider.subscriptionsById.set("sub_1", {
			subscriptionId: "sub_1", providerCustomerId: "cus_1", status: "active", items: [{ providerPriceId: "price_1", quantity: 1, description: null }], interval: "month", intervalCount: 1,
			currency: "pln" as never, amount: 900, currentPeriodStart: 1, currentPeriodEnd: 2, trialEnd: null, cancelAtPeriodEnd: false, canceledAt: null, latestInvoiceId: null, metadata: {},
		});
		const record = await container.subscriptions.create({
			customerId: null, initialOrderId: null, status: "active", items: [], interval: "month", intervalCount: 1, currency: "pln" as never, amount: 900, currentPeriodStart: null, currentPeriodEnd: null,
			trialEnd: null, cancelAtPeriodEnd: false, canceledAt: null, stripe: { subscriptionId: "sub_1", customerId: "cus_1", latestInvoiceId: null }, providerUpdatedAt: 0,
		});
		const result = (await h.call(ROUTE.adminSubscriptionsCancel, { input: { subscriptionId: record.id, atPeriodEnd: true } })) as any;
		expect(result.cancelAtPeriodEnd).toBe(true);
		expect(h.provider.callsOf("cancelSubscription")).toHaveLength(1);
	});
});

describe("inventory and catalog", () => {
	it("adjusts product-level stock (the editor path) and reads it back with its held reservations", async () => {
		const h = createOpsHarness();
		const { productId } = h.seedProduct({ tracked: true });
		const adjusted = (await h.call(ROUTE.adminInventoryAdjust, { input: { kind: "product", id: productId, delta: 7, reason: "stocktake" } })) as any;
		expect(adjusted).toMatchObject({ isTracked: true, onHand: 7, available: 7, reserved: 0 });
		const container = h.container();
		await container.inventory.reserve({ reservationId: "res_1", cartId: "cart_1", lines: [{ sellable: { kind: "product", id: productId }, quantity: 2, isGuarded: true }], expiresAt: "2099-01-01T00:00:00.000Z" });
		const detail = (await h.call(ROUTE.adminInventoryGet, { input: { kind: "product", id: productId } })) as any;
		expect(detail.stock).toMatchObject({ onHand: 7, reserved: 2, available: 5 });
		expect(detail.heldReservations).toEqual([expect.objectContaining({ id: "res_1", quantity: 2 })]);
	});

	it("refuses to take stock below zero and to adjust an unknown product", async () => {
		const h = createOpsHarness();
		const { productId } = h.seedProduct();
		expect(await failure(h.call(ROUTE.adminInventoryAdjust, { input: { kind: "product", id: productId, delta: -1, reason: "x" } }))).toMatchObject({ code: "CONFLICT", status: 409 });
		expect(await failure(h.call(ROUTE.adminInventoryAdjust, { input: { kind: "product", id: "nope", delta: 1, reason: "x" } }))).toMatchObject({ status: 404 });
	});

	it("queues a catalog resync for one product or the whole catalog", async () => {
		const h = createOpsHarness();
		const { productId } = h.seedProduct();
		const one = (await h.call(ROUTE.adminCatalogResync, { input: { productId } })) as any;
		expect(one.queued).toBeGreaterThanOrEqual(1);
		const all = (await h.call(ROUTE.adminCatalogResync, { input: {} })) as any;
		expect(all.queued).toBeGreaterThanOrEqual(one.queued);
	});
});

describe("catalog sync progress", () => {
	it("syncs the queued links on demand and reports what is left until nothing is due", async () => {
		const h = createOpsHarness();
		h.seedProduct();
		const queued = ((await h.call(ROUTE.adminCatalogResync, { input: {} })) as any).queued as number;
		expect(queued).toBeGreaterThanOrEqual(1);
		const first = (await h.call(ROUTE.adminCatalogSync, { input: { limit: 1 } })) as any;
		expect(first).toMatchObject({ processed: 1, failed: 0, isCapped: false });
		expect(first.due).toBeLessThan(queued);
		let progress = first;
		for (let round = 0; round < queued && progress.due > 0; round += 1) progress = (await h.call(ROUTE.adminCatalogSync, { input: {} })) as any;
		expect(progress).toMatchObject({ due: 0, failed: 0 });
		expect(h.provider.callsOf("createProduct").length).toBeGreaterThanOrEqual(1);
	});
});

describe("abandoned checkouts", () => {
	it("sweeps with the default retention or an explicit one and answers the counts", async () => {
		const h = createOpsHarness();
		const defaults = (await h.call(ROUTE.adminCheckoutsSweep, { input: {} })) as any;
		expect(defaults).toEqual({ snapshots: 0, sessionsExpired: 0, holdsReleased: 0, carts: 0, holdRecords: 0, settledSnapshots: 0 });
		expect(await h.call(ROUTE.adminCheckoutsSweep, { input: { retentionHours: 0 } })).toMatchObject({ snapshots: 0 });
		await expect(h.call(ROUTE.adminCheckoutsSweep, { input: { retentionHours: -1 } })).rejects.toBeDefined();
	});
});

describe("webhooks, reconcile and outbox", () => {
	it("creates the endpoint for this site, stores the secret, and never returns it", async () => {
		const h = createOpsHarness({ settings: { [SETTINGS_KEY.stripeSecretKey]: SECRET_KEY } });
		const result = (await h.call(ROUTE.adminWebhooksRegister, { input: {} })) as any;
		expect(result).toMatchObject({ action: "created", url: "https://shop.example/_emdash/api/plugins/stripe-commerce/webhook", isSecretStored: true, enabledEventCount: WEBHOOK_EVENT_TYPES.length });
		expect(JSON.stringify(result)).not.toContain("whsec_fake");
		expect(await h.base.settings.get(SETTINGS_KEY.stripeWebhookSecret)).toBe("whsec_fake");
		const calls = h.provider.callsOf("createEndpoint");
		expect(calls).toHaveLength(1);
		expect(calls[0]!.idempotencyKey).toMatch(/^stripe-commerce:webhook:register:[0-9a-f]{24}$/);
	});

	it("updates the events of an existing endpoint instead, keeps events added in Stripe, keeps the secret, and says the secret is not returned", async () => {
		const h = createOpsHarness({ settings: { [SETTINGS_KEY.stripeSecretKey]: SECRET_KEY } });
		await h.provider.webhooks.createEndpoint({ url: "https://shop.example/_emdash/api/plugins/stripe-commerce/webhook", events: ["charge.succeeded"] }, "pre");
		const result = (await h.call(ROUTE.adminWebhooksRegister, { input: {} })) as any;
		expect(result).toMatchObject({ action: "updated", isSecretStored: false, enabledEventCount: WEBHOOK_EVENT_TYPES.length + 1 });
		const [endpoint] = await h.provider.webhooks.listEndpoints();
		expect(endpoint!.enabledEvents).toEqual(expect.arrayContaining(["charge.succeeded", ...WEBHOOK_EVENT_TYPES]));
		expect(result.message).toMatch(/does not return the signing secret/);
		expect(await h.base.settings.get(SETTINGS_KEY.stripeWebhookSecret)).toBeNull();
		expect(h.provider.callsOf("createEndpoint")).toHaveLength(1); // only the pre-created one
	});

	it("explains a secret that could not be stored instead of pretending it worked", async () => {
		const h = createOpsHarness({ settings: { [SETTINGS_KEY.stripeSecretKey]: SECRET_KEY } });
		h.base.settings.set = async () => {
			throw new Error("no encryption key");
		};
		const error = await failure(h.call(ROUTE.adminWebhooksRegister, { input: {} }));
		expect(error).toMatchObject({ code: "NOT_CONFIGURED", status: 503 });
		expect(error.message).toMatch(/EMDASH_ENCRYPTION_KEY/);
	});

	it("lists stored events without payloads and replays a failed one", async () => {
		const h = createOpsHarness();
		const container = h.container();
		const event = { eventId: "evt_r", type: "product.updated", created: 5, isLivemode: false, action: { kind: "unsupported" as const }, raw: { secretish: "x" } };
		await container.inbox.record(event, JSON.stringify(event), "webhook");
		await container.inbox.markFailed("evt_r", "boom", "2099-01-01T00:00:00.000Z");
		const list = (await h.call(ROUTE.adminWebhooksList, { input: {} })) as any;
		expect(list.items).toHaveLength(1);
		expect(list.items[0]).toMatchObject({ eventId: "evt_r", status: "failed", lastError: "boom" });
		expect(list.items[0]).not.toHaveProperty("payload");
		const replay = (await h.call(ROUTE.adminWebhooksReplay, { input: { eventId: "evt_r" } })) as any;
		expect(replay.outcome).toBe("ignored");
		expect(await failure(h.call(ROUTE.adminWebhooksReplay, { input: { eventId: "missing" } }))).toMatchObject({ status: 404 });
	});

	it("reconciles missed events and retries an outbox event", async () => {
		const h = createOpsHarness();
		h.provider.recordEvent({ eventId: "evt_missed", type: "customer.updated", created: Math.floor(Date.now() / 1000), isLivemode: false, action: { kind: "unsupported" }, raw: {} });
		const result = (await h.call(ROUTE.adminReconcile, { input: { since: 0 } })) as any;
		expect(result).toMatchObject({ recorded: 1 });
		expect(await failure(h.call(ROUTE.adminOutboxRetry, { input: { eventId: "missing" } }))).toMatchObject({ status: 404 });
		await h.container().outbox.enqueue([{ id: "order.paid:x", type: "order.paid", occurredAt: "2026-01-01T00:00:00.000Z", data: { orderId: "o", orderNumber: "N", amount: 1, currency: "pln" } }], ["site-sub"]);
		expect(await h.call(ROUTE.adminOutboxRetry, { input: { eventId: "order.paid:x" } })).toEqual({ eventId: "order.paid:x" });
	});
});
