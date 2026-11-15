import { ProviderError } from "../../ports/payment-provider.js";

/**
 * Every SDK call goes through `callStripe` / `retrieveStripe`, so services only ever see
 * `ProviderError`. Messages carry the operation, Stripe's own message (secrets redacted) and the
 * request id for support, never request bodies.
 */

/** Stripe error classes (`error.type`) that are transient by nature. */
const RETRYABLE_ERROR_TYPES: ReadonlySet<string> = new Set([
	"StripeConnectionError",
	"StripeRateLimitError",
	"StripeAPIError",
]);

/** Error codes that are transient whatever the class: lock contention, rate limit, in-flight idempotent request. */
const RETRYABLE_ERROR_CODES: ReadonlySet<string> = new Set(["lock_timeout", "rate_limit", "idempotency_key_in_use"]);

export const STRIPE_ERROR_CODE = {
	resourceMissing: "resource_missing",
	notConfigured: "not_configured",
	portalNotConfigured: "portal_not_configured",
	unexpected: "unexpected",
	invalidResponse: "invalid_response",
} as const;

interface StripeErrorLike {
	type: string;
	message: string;
	code?: string;
	statusCode?: number;
	requestId?: string;
	rawType?: string;
}

const isStripeErrorLike = (error: unknown): error is Error & StripeErrorLike => {
	if (!(error instanceof Error)) return false;
	const type = (error as unknown as { type?: unknown }).type;
	return typeof type === "string" && type.startsWith("Stripe");
};

/** Removes anything that looks like an API key or webhook secret from provider text. */
const SECRET_PATTERN = /\b(?:sk|rk|pk|whsec)_(?:live_|test_)?[A-Za-z0-9*]+/g;
export const redactSecrets = (text: string): string => text.replace(SECRET_PATTERN, "[redacted]");

const AUTH_MESSAGE = "Stripe rejected the API key (invalid, revoked or missing permission)";

const isRetryableError = (error: StripeErrorLike): boolean => {
	if (error.code && RETRYABLE_ERROR_CODES.has(error.code)) return true;
	if (RETRYABLE_ERROR_TYPES.has(error.type)) return true;
	return typeof error.statusCode === "number" && (error.statusCode >= 500 || error.statusCode === 429);
};

export const isResourceMissing = (error: unknown): boolean =>
	isStripeErrorLike(error) && error.code === STRIPE_ERROR_CODE.resourceMissing;

export const toProviderError = (error: unknown, operation: string): ProviderError => {
	if (error instanceof ProviderError) return error;
	if (!isStripeErrorLike(error)) {
		const message = error instanceof Error ? redactSecrets(error.message) : "unknown failure";
		return new ProviderError(`Stripe ${operation} failed: ${message}`, {
			isRetryable: false,
			providerCode: STRIPE_ERROR_CODE.unexpected,
			cause: error,
		});
	}
	const providerCode = error.code ?? error.rawType ?? error.type;
	const detail = error.type === "StripeAuthenticationError" ? AUTH_MESSAGE : redactSecrets(error.message);
	const suffix = error.requestId ? ` (request ${error.requestId})` : "";
	return new ProviderError(`Stripe ${operation} failed: ${detail}${suffix}`, {
		isRetryable: isRetryableError(error),
		providerCode,
		cause: error,
	});
};

export const callStripe = async <T>(operation: string, call: () => Promise<T>): Promise<T> => {
	try {
		return await call();
	} catch (error) {
		throw toProviderError(error, operation);
	}
};

/** A retrieve where "does not exist" is an answer (`null`), not a failure. */
export const retrieveStripe = async <T>(operation: string, call: () => Promise<T>): Promise<T | null> => {
	try {
		return await call();
	} catch (error) {
		if (isResourceMissing(error)) return null;
		throw toProviderError(error, operation);
	}
};

/** True for Stripe's permission error (a restricted key without the needed permission). */
export const isPermissionError = (error: unknown): boolean => isStripeErrorLike(error) && error.type === "StripePermissionError";
