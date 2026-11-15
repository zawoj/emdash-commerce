import Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";

import { loadStripeEvent } from "../../testing/fixtures/stripe/index.js";
import { WEBHOOK_SECRET } from "./test-support.js";
import { toProviderWebhookEvent } from "./webhook-events.js";
import { createStripeProvider } from "./provider.js";
import { createWebhooksProvider } from "./webhooks.js";

const subscriptionWithoutRecurringItem = (): Stripe.Event => {
	const event = structuredClone(loadStripeEvent("customer.subscription.updated"));
	const subscription = event.data.object as Stripe.Subscription;
	for (const item of subscription.items.data) (item.price as { recurring: unknown }).recurring = null;
	return event;
};

describe("events that cannot be mapped", () => {
	it("becomes unsupported with the raw event intact, and says why", () => {
		const event = subscriptionWithoutRecurringItem();
		const onUnmappable = vi.fn();
		const result = toProviderWebhookEvent(event, { onUnmappable });
		expect(result.action).toEqual({ kind: "unsupported" });
		expect(result).toMatchObject({ eventId: event.id, type: "customer.subscription.updated", created: event.created });
		expect(result.raw).toBe(event);
		expect(onUnmappable).toHaveBeenCalledWith({ eventId: event.id, type: event.type, reason: expect.stringContaining("no recurring item") });
	});

	it("does not make verifyAndParse throw, so the webhook route can answer 200 instead of failing forever", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const provider = createWebhooksProvider(() => {
			throw new Error("no client needed");
		}, { webhookSecret: WEBHOOK_SECRET });
		const body = JSON.stringify(subscriptionWithoutRecurringItem());
		const header = Stripe.webhooks.generateTestHeaderString({ payload: body, secret: WEBHOOK_SECRET });
		await expect(provider.verifyAndParse(body, header)).resolves.toMatchObject({ action: { kind: "unsupported" } });
		expect(warn).toHaveBeenCalledOnce();
		warn.mockRestore();
	});

	it("reports an unmappable event to the logger the provider was given instead of console.warn", async () => {
		const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const warn = vi.fn();
		const provider = createStripeProvider({ secretKey: "sk_test_x", webhookSecret: WEBHOOK_SECRET, integrationIdentifier: "int", appVersion: "0", log: { warn } });
		const body = JSON.stringify(subscriptionWithoutRecurringItem());
		const header = Stripe.webhooks.generateTestHeaderString({ payload: body, secret: WEBHOOK_SECRET });
		await provider.webhooks.verifyAndParse(body, header);
		expect(warn).toHaveBeenCalledWith(expect.stringContaining("could not be mapped"), expect.objectContaining({ type: "customer.subscription.updated" }));
		expect(consoleWarn).not.toHaveBeenCalled();
		consoleWarn.mockRestore();
	});

	it("still throws on a bad signature (the mapping fallback does not weaken verification)", async () => {
		const provider = createWebhooksProvider(() => {
			throw new Error("no client needed");
		}, { webhookSecret: WEBHOOK_SECRET });
		const body = JSON.stringify(subscriptionWithoutRecurringItem());
		await expect(provider.verifyAndParse(body, "t=1,v1=00")).rejects.toThrow(/signature/i);
	});
});
