import Stripe from "stripe";
import { vi } from "vitest";

/** Test helpers: a Stripe client whose resources are plain mocks, and SDK-shaped errors. */

export const fakeStripe = (resources: Record<string, unknown>): Stripe => resources as unknown as Stripe;

export const stripeError = (
	kind: "StripeInvalidRequestError" | "StripeCardError" | "StripeAPIError" | "StripeAuthenticationError" | "StripePermissionError" | "StripeRateLimitError" | "StripeConnectionError" | "StripeIdempotencyError",
	raw: { message: string; code?: string; statusCode?: number; requestId?: string },
): Error => {
	const ErrorClass = Stripe.errors[kind];
	const rawType = {
		StripeInvalidRequestError: "invalid_request_error",
		StripeCardError: "card_error",
		StripeAPIError: "api_error",
		StripeAuthenticationError: "authentication_error",
		StripePermissionError: "invalid_request_error",
		StripeRateLimitError: "rate_limit_error",
		StripeConnectionError: "api_error",
		StripeIdempotencyError: "idempotency_error",
	}[kind];
	return new ErrorClass({ ...raw, type: rawType } as ConstructorParameters<typeof ErrorClass>[0]);
};

export const resolved = <T>(value: T) => vi.fn().mockResolvedValue(value);

export const SECRET_KEY = "sk_test_FAKEKEYFORTESTS0000000000";
export const WEBHOOK_SECRET = "whsec_FAKESECRETFORTESTS0000000000";
