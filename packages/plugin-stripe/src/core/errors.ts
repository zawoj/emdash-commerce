/**
 * Every failure a client can see has a stable code. Services throw `CommerceError`; the route
 * boundary (plugin/http.ts) turns it into `PluginRouteError` with the mapped HTTP status, because an
 * EmDash route that returns an error object answers 200. Unknown errors become a generic 500 and are
 * logged with their cause; their message never reaches the client.
 */

export const COMMERCE_ERROR = {
	invalidInput: { code: "INVALID_INPUT", status: 400 },
	notConfigured: { code: "NOT_CONFIGURED", status: 503 },
	invalidSignature: { code: "INVALID_SIGNATURE", status: 400 },
	unauthorized: { code: "UNAUTHORIZED", status: 401 },
	forbidden: { code: "FORBIDDEN", status: 403 },
	notFound: { code: "NOT_FOUND", status: 404 },
	conflict: { code: "CONFLICT", status: 409 },
	cartNotCheckoutReady: { code: "CART_NOT_CHECKOUT_READY", status: 409 },
	cartLocked: { code: "CART_LOCKED", status: 409 },
	insufficientStock: { code: "INSUFFICIENT_STOCK", status: 409 },
	/** A bounded catalog relation (variants of a product, prices of a sellable, …) holds more links than the plugin reads. */
	catalogLimitExceeded: { code: "CATALOG_LIMIT_EXCEEDED", status: 409 },
	refundNotAllowed: { code: "REFUND_NOT_ALLOWED", status: 409 },
	rateLimited: { code: "RATE_LIMITED", status: 429 },
	providerError: { code: "PROVIDER_ERROR", status: 502 },
	internal: { code: "INTERNAL", status: 500 },
} as const;

export type CommerceErrorKind = keyof typeof COMMERCE_ERROR;
export type CommerceErrorCode = (typeof COMMERCE_ERROR)[CommerceErrorKind]["code"];

export class CommerceError extends Error {
	readonly kind: CommerceErrorKind;
	readonly code: CommerceErrorCode;
	readonly status: number;
	/** Safe to send to the client (no secrets, no stack, no provider internals). */
	readonly details: Record<string, unknown> | undefined;

	constructor(kind: CommerceErrorKind, message: string, details?: Record<string, unknown>, options?: { cause?: unknown }) {
		super(message, options);
		this.name = "CommerceError";
		this.kind = kind;
		this.code = COMMERCE_ERROR[kind].code;
		this.status = COMMERCE_ERROR[kind].status;
		this.details = details;
	}
}

export const isCommerceError = (error: unknown): error is CommerceError => error instanceof CommerceError;
