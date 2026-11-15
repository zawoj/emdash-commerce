import { describe, expect, it } from "vitest";

import { ProviderError } from "../../ports/payment-provider.js";
import { callStripe, redactSecrets, retrieveStripe, toProviderError } from "./errors.js";
import { SECRET_KEY, stripeError } from "./test-support.js";

describe("toProviderError retryability", () => {
	const retryable = [
		["connection error", stripeError("StripeConnectionError", { message: "socket hang up" })],
		["rate limit", stripeError("StripeRateLimitError", { message: "slow down", statusCode: 429 })],
		["rate limit without a status", stripeError("StripeRateLimitError", { message: "slow down" })],
		["API error", stripeError("StripeAPIError", { message: "boom", statusCode: 500 })],
		["API error without a status", stripeError("StripeAPIError", { message: "boom" })],
		["429 of any class", stripeError("StripeInvalidRequestError", { message: "too many", statusCode: 429 })],
		["lock timeout", stripeError("StripeInvalidRequestError", { message: "lock", code: "lock_timeout", statusCode: 400 })],
		["idempotent request still in flight", stripeError("StripeIdempotencyError", { message: "in use", code: "idempotency_key_in_use", statusCode: 409 })],
		["any 5xx", stripeError("StripeInvalidRequestError", { message: "gateway", statusCode: 503 })],
	] as const;
	it.each(retryable)("%s is retryable", (_name, error) => {
		const mapped = toProviderError(error, "test");
		expect(mapped).toBeInstanceOf(ProviderError);
		expect(mapped.isRetryable).toBe(true);
	});

	const permanent = [
		["invalid request", stripeError("StripeInvalidRequestError", { message: "No such price", code: "resource_missing", statusCode: 404 })],
		["card error", stripeError("StripeCardError", { message: "declined", code: "card_declined", statusCode: 402 })],
		["authentication", stripeError("StripeAuthenticationError", { message: "bad key", statusCode: 401 })],
		["permission", stripeError("StripePermissionError", { message: "no permission", statusCode: 403 })],
		["idempotency key reused for another payload", stripeError("StripeIdempotencyError", { message: "different params", statusCode: 400 })],
	] as const;
	it.each(permanent)("%s is not retryable", (_name, error) => {
		expect(toProviderError(error, "test").isRetryable).toBe(false);
	});

	it("treats a non-Stripe failure as not retryable and keeps the cause", () => {
		const cause = new TypeError("bug");
		const mapped = toProviderError(cause, "test");
		expect(mapped.isRetryable).toBe(false);
		expect(mapped.cause).toBe(cause);
	});

	it("passes a ProviderError through unchanged", () => {
		const original = new ProviderError("already mapped", { isRetryable: true });
		expect(toProviderError(original, "test")).toBe(original);
	});
});

describe("toProviderError messages", () => {
	it("keeps the provider code, operation and request id", () => {
		const mapped = toProviderError(
			stripeError("StripeInvalidRequestError", { message: "No such price: 'price_1'", code: "resource_missing", requestId: "req_123" }),
			"price retrieve",
		);
		expect(mapped.providerCode).toBe("resource_missing");
		expect(mapped.message).toBe("Stripe price retrieve failed: No such price: 'price_1' (request req_123)");
	});

	it("never leaks an API key, not even a partial one Stripe echoes back", () => {
		const mapped = toProviderError(
			stripeError("StripeAuthenticationError", { message: `Invalid API Key provided: ${SECRET_KEY}`, statusCode: 401 }),
			"account retrieve",
		);
		expect(mapped.message).not.toContain("sk_test");
		expect(mapped.message).not.toContain("FAKEKEY");
	});

	it("redacts keys and webhook secrets from any message", () => {
		expect(redactSecrets("key sk_live_abc123 and rk_test_XYZ*** and whsec_aaa111")).toBe("key [redacted] and [redacted] and [redacted]");
	});
});

describe("callStripe / retrieveStripe", () => {
	it("wraps a rejected call in a ProviderError", async () => {
		await expect(callStripe("op", () => Promise.reject(stripeError("StripeCardError", { message: "no" })))).rejects.toBeInstanceOf(ProviderError);
	});

	it("returns the value on success", async () => {
		await expect(callStripe("op", () => Promise.resolve(42))).resolves.toBe(42);
	});

	it("turns resource_missing into null on a retrieve", async () => {
		const missing = stripeError("StripeInvalidRequestError", { message: "No such customer", code: "resource_missing", statusCode: 404 });
		await expect(retrieveStripe("op", () => Promise.reject(missing))).resolves.toBeNull();
	});

	it("does not hide other retrieve failures", async () => {
		const outage = stripeError("StripeAPIError", { message: "down", statusCode: 500 });
		await expect(retrieveStripe("op", () => Promise.reject(outage))).rejects.toMatchObject({ isRetryable: true });
	});

	it("does not treat resource_missing as null on a write", async () => {
		const missing = stripeError("StripeInvalidRequestError", { message: "No such price", code: "resource_missing", statusCode: 404 });
		await expect(callStripe("op", () => Promise.reject(missing))).rejects.toBeInstanceOf(ProviderError);
	});
});
