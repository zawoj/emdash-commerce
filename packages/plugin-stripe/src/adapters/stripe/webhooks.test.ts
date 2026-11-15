import Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";

import { loadStripeEvent } from "../../testing/fixtures/stripe/index.js";
import { WebhookSignatureError } from "../../ports/payment-provider.js";
import { STRIPE_API_VERSION } from "./constants.js";
import { fakeStripe, WEBHOOK_SECRET } from "./test-support.js";
import { createWebhooksProvider } from "./webhooks.js";
import { WEBHOOK_EVENT_TYPES } from "./webhook-events.js";

const NO_CLIENT = () => {
	throw new Error("the Stripe client must not be needed to verify a webhook");
};

const signedBody = (body: string, secret = WEBHOOK_SECRET, timestamp?: number): string =>
	Stripe.webhooks.generateTestHeaderString({ payload: body, secret, ...(timestamp ? { timestamp } : {}) });

const rawEvent = (type: Parameters<typeof loadStripeEvent>[0] = "checkout.session.completed"): string => JSON.stringify(loadStripeEvent(type));

describe("verifyAndParse", () => {
	const provider = createWebhooksProvider(NO_CLIENT, { webhookSecret: WEBHOOK_SECRET });

	it("accepts a correctly signed body and returns the normalised event", async () => {
		const body = rawEvent();
		const event = await provider.verifyAndParse(body, signedBody(body));
		expect(event).toMatchObject({ type: "checkout.session.completed", action: { kind: "checkout_completed" } });
		expect((event.raw as Stripe.Event).id).toBe(loadStripeEvent("checkout.session.completed").id);
	});

	it("rejects a body changed after signing", async () => {
		const body = rawEvent();
		const header = signedBody(body);
		await expect(provider.verifyAndParse(body.replace("pln", "usd"), header)).rejects.toBeInstanceOf(WebhookSignatureError);
	});

	it("rejects a signature made with another secret", async () => {
		const body = rawEvent();
		await expect(provider.verifyAndParse(body, signedBody(body, "whsec_someoneElse"))).rejects.toBeInstanceOf(WebhookSignatureError);
	});

	it("rejects a malformed header", async () => {
		await expect(provider.verifyAndParse(rawEvent(), "t=1,v1=zz")).rejects.toBeInstanceOf(WebhookSignatureError);
	});

	it("rejects a missing header", async () => {
		await expect(provider.verifyAndParse(rawEvent(), null)).rejects.toThrow("Missing Stripe-Signature header");
		await expect(provider.verifyAndParse(rawEvent(), "")).rejects.toBeInstanceOf(WebhookSignatureError);
	});

	it("rejects a stale timestamp (replay)", async () => {
		const body = rawEvent();
		const tenMinutesAgo = Math.floor(Date.now() / 1000) - 600;
		await expect(provider.verifyAndParse(body, signedBody(body, WEBHOOK_SECRET, tenMinutesAgo))).rejects.toBeInstanceOf(WebhookSignatureError);
	});

	it("rejects everything when no signing secret is configured", async () => {
		const unconfigured = createWebhooksProvider(NO_CLIENT, { webhookSecret: null });
		const body = rawEvent();
		await expect(unconfigured.verifyAndParse(body, signedBody(body))).rejects.toThrow("not configured");
	});

	it("does not echo the secret in the error", async () => {
		const body = rawEvent();
		const error = await provider.verifyAndParse(body, signedBody(body, "whsec_other")).catch((caught: unknown) => caught);
		expect(String((error as Error).message)).not.toContain(WEBHOOK_SECRET);
	});
});

const eventAt = (id: string, created: number, type = "customer.created"): Stripe.Event =>
	({ ...loadStripeEvent("customer.created"), id, created, type }) as unknown as Stripe.Event;

/** A list() result that is async-iterable, like the SDK's auto-pagination promise. */
const listOf = (events: Stripe.Event[]) => ({
	[Symbol.asyncIterator]: async function* () {
		for (const event of events) yield event;
	},
});

describe("listEventsSince", () => {
	it("passes created.gt and the types, and yields oldest first", async () => {
		const list = vi.fn().mockReturnValue(listOf([eventAt("evt_3", 300), eventAt("evt_2", 200), eventAt("evt_1", 100)]));
		const provider = createWebhooksProvider(() => fakeStripe({ events: { list } }), { webhookSecret: null });
		const seen: string[] = [];
		for await (const event of provider.listEventsSince(50, ["customer.created"])) seen.push(event.eventId);
		expect(seen).toEqual(["evt_1", "evt_2", "evt_3"]);
		expect(list).toHaveBeenCalledWith({ created: { gt: 50 }, types: ["customer.created"], limit: 100 });
	});

	it("splits the type filter into slices of 20 and merges by time", async () => {
		const list = vi
			.fn()
			.mockReturnValueOnce(listOf([eventAt("evt_b2", 400), eventAt("evt_b1", 200)]))
			.mockReturnValueOnce(listOf([eventAt("evt_a2", 300), eventAt("evt_a1", 100)]));
		const provider = createWebhooksProvider(() => fakeStripe({ events: { list } }), { webhookSecret: null });
		const seen: string[] = [];
		for await (const event of provider.listEventsSince(0, WEBHOOK_EVENT_TYPES)) seen.push(event.eventId);
		expect(seen).toEqual(["evt_a1", "evt_b1", "evt_a2", "evt_b2"]);
		expect(list).toHaveBeenCalledTimes(2);
		for (const [params] of list.mock.calls as Array<[{ types: string[] }]>) expect(params.types.length).toBeLessThanOrEqual(20);
		const all = (list.mock.calls as Array<[{ types: string[] }]>).flatMap(([params]) => params.types);
		expect(all.sort()).toEqual([...WEBHOOK_EVENT_TYPES].sort());
	});

	it("keeps same-second events in delivery order and drops duplicates", async () => {
		const list = vi.fn().mockReturnValue(listOf([eventAt("evt_late", 100), eventAt("evt_early", 100), eventAt("evt_early", 100)]));
		const provider = createWebhooksProvider(() => fakeStripe({ events: { list } }), { webhookSecret: null });
		const seen: string[] = [];
		for await (const event of provider.listEventsSince(0, ["customer.created"])) seen.push(event.eventId);
		expect(seen).toEqual(["evt_early", "evt_late"]);
	});

	it("asks for nothing when no types are given", async () => {
		const list = vi.fn();
		const provider = createWebhooksProvider(() => fakeStripe({ events: { list } }), { webhookSecret: null });
		for await (const _event of provider.listEventsSince(0, [])) throw new Error("unexpected event");
		expect(list).not.toHaveBeenCalled();
	});

	it("surfaces a provider failure as a ProviderError", async () => {
		const list = vi.fn().mockReturnValue({
			[Symbol.asyncIterator]: async function* () {
				throw new Error("network down");
			},
		});
		const provider = createWebhooksProvider(() => fakeStripe({ events: { list } }), { webhookSecret: null });
		await expect(provider.listEventsSince(0, ["customer.created"])[Symbol.asyncIterator]().next()).rejects.toMatchObject({ name: "ProviderError" });
	});
});

describe("endpoints", () => {
	const endpoint = { id: "we_1", url: "https://example.com/hook", enabled_events: ["customer.created"], status: "enabled", secret: "whsec_new" };

	it("creates an endpoint pinned to the API version, passes the idempotency key and returns the secret", async () => {
		const create = vi.fn().mockResolvedValue(endpoint);
		const provider = createWebhooksProvider(() => fakeStripe({ webhookEndpoints: { create } }), { webhookSecret: null });
		const result = await provider.createEndpoint({ url: endpoint.url, events: ["customer.created"] }, "stripe-commerce:endpoint:1");
		expect(create).toHaveBeenCalledWith(
			{ url: endpoint.url, enabled_events: ["customer.created"], api_version: STRIPE_API_VERSION },
			{ idempotencyKey: "stripe-commerce:endpoint:1" },
		);
		expect(result).toEqual({ endpointId: "we_1", url: endpoint.url, enabledEvents: ["customer.created"], status: "enabled", secret: "whsec_new" });
	});

	it("returns a null secret when Stripe does not send one", async () => {
		const create = vi.fn().mockResolvedValue({ ...endpoint, secret: undefined });
		const provider = createWebhooksProvider(() => fakeStripe({ webhookEndpoints: { create } }), { webhookSecret: null });
		await expect(provider.createEndpoint({ url: endpoint.url, events: [] }, "k")).resolves.toMatchObject({ secret: null });
	});

	it("updates the enabled events", async () => {
		const update = vi.fn().mockResolvedValue({ ...endpoint, secret: undefined });
		const provider = createWebhooksProvider(() => fakeStripe({ webhookEndpoints: { update } }), { webhookSecret: null });
		await provider.updateEndpoint("we_1", { events: ["invoice.paid"] });
		expect(update).toHaveBeenCalledWith("we_1", { enabled_events: ["invoice.paid"] });
	});

	it("lists endpoints", async () => {
		const autoPagingToArray = vi.fn().mockResolvedValue([endpoint]);
		const list = vi.fn().mockReturnValue({ autoPagingToArray });
		const provider = createWebhooksProvider(() => fakeStripe({ webhookEndpoints: { list } }), { webhookSecret: null });
		await expect(provider.listEndpoints()).resolves.toEqual([
			{ endpointId: "we_1", url: endpoint.url, enabledEvents: ["customer.created"], status: "enabled" },
		]);
	});
});
