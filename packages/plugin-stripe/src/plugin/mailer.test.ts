import { describe, expect, it } from "vitest";

import { buildCollectionDefinitions } from "../adapters/emdash/schema/collections.js";
import { commerceOptionsSchema } from "../contracts/options.js";
import { createFakePluginContext } from "../testing/index.js";
import { createContainer } from "./container.js";

const options = commerceOptionsSchema.parse({});
const definitions = buildCollectionDefinitions(options.collections, options.supportedCurrencies);
const message = { to: "buyer@example.com", subject: "Order", text: "Thanks", html: null };

describe("container mailer: a missing provider is a state, a failing provider is an error", () => {
	it("resolves true when the provider accepts the message", async () => {
		const ctx = createFakePluginContext(definitions);
		await expect(createContainer(ctx, options, {}).mailer.send(message)).resolves.toBe(true);
		expect(ctx.sentEmails).toHaveLength(1);
	});

	it("resolves false when no email provider is configured", async () => {
		const ctx = createFakePluginContext(definitions);
		(ctx as { email?: unknown }).email = undefined;
		await expect(createContainer(ctx, options, {}).mailer.send(message)).resolves.toBe(false);
	});

	it("rejects when the configured provider fails, so the outbox retries the email", async () => {
		const ctx = createFakePluginContext(definitions);
		(ctx as { email?: unknown }).email = { send: async () => Promise.reject(new Error("SMTP 451")) };
		await expect(createContainer(ctx, options, {}).mailer.send(message)).rejects.toThrow("SMTP 451");
	});
});
