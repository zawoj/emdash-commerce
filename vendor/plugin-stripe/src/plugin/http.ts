import { PluginRouteError, type PluginContext, type RouteContext } from "emdash";
import type { ZodType } from "zod";

import { CART_COOKIE, CART_HEADER, CART_ID_PATTERN } from "../contracts/api.js";
import { CommerceError, isCommerceError } from "../core/errors.js";
import { ProviderError } from "../ports/payment-provider.js";
import type { CommerceContainer } from "./container.js";

/**
 * The single route boundary. Every route module goes through `runRoute`, so input validation, cart
 * identity, rate limiting and error mapping are decided in one place:
 *
 * - Input: validated with the contract's zod schema. EmDash parses the input by method before the handler
 *   runs (emdash/src/plugins/routes.ts parseRouteInput): POST, PUT and PATCH read the JSON body;
 *   GET, HEAD and DELETE read the URL query string into an object (a repeated key becomes an array). A
 *   DELETE therefore carries its input in the query (`DELETE cart/lines?priceId=…`), not in a body.
 * - Cart identity: the `x-commerce-cart` header, then the `emdash_commerce_cart` cookie, accepted only if it
 *   matches `CART_ID_PATTERN` (a malformed id is treated as no cart, never as an error).
 * - Errors: `CommerceError` -> `PluginRouteError(code, message, status, details)`; `ProviderError` -> 502
 *   `PROVIDER_ERROR`; anything else is logged and answered as a generic 500 `INTERNAL` (a returned error
 *   object would be HTTP 200; the message never reaches the client).
 */

export interface RateLimitSpec {
	/** Bucket name, combined with the caller's IP. */
	name: string;
	limit(options: CommerceContainer["options"]): number;
	windowMs: number;
}

export interface RouteInvocation<TInput> {
	ctx: RouteContext;
	container: CommerceContainer;
	input: TInput;
	/** A syntactically valid cart id from the header or cookie, or null. */
	cartId: string | null;
}

export interface RouteSpec<TInput, TOutput> {
	/** Contract schema; omit for routes without input. */
	schema?: ZodType<TInput>;
	rateLimit?: RateLimitSpec;
	/** Skip the lazy schema reconcile (routes that never touch content). */
	skipReady?: boolean;
	handler(invocation: RouteInvocation<TInput>): Promise<TOutput>;
}

const PROVIDER_ERROR_MESSAGE = "The payment provider could not complete the request. Try again shortly.";
const INTERNAL_MESSAGE = "An internal error occurred";

export const parseCookie = (header: string | null, name: string): string | null => {
	if (!header) return null;
	for (const part of header.split(";")) {
		const separator = part.indexOf("=");
		if (separator < 0) continue;
		if (part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
	}
	return null;
};

export const extractCartId = (request: Pick<Request, "headers">): string | null => {
	for (const candidate of [request.headers.get(CART_HEADER), parseCookie(request.headers.get("cookie"), CART_COOKIE)]) {
		if (candidate && CART_ID_PATTERN.test(candidate)) return candidate;
	}
	return null;
};

export const parseInput = <TInput>(schema: ZodType<TInput> | undefined, raw: unknown): TInput => {
	if (!schema) return undefined as TInput;
	const parsed = schema.safeParse(raw);
	if (parsed.success) return parsed.data;
	// Paths and messages only: echoing submitted values could reflect secrets or PII into logs and responses.
	throw new CommerceError("invalidInput", "Invalid request", {
		issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
	});
};

type RouteLog = Pick<PluginContext["log"], "warn" | "error">;

/** The one place an error becomes an HTTP answer. Always throws. */
export const toRouteError = (error: unknown, log: RouteLog): PluginRouteError => {
	if (error instanceof PluginRouteError || (error instanceof Error && error.name === "PluginRouteError")) return error as PluginRouteError;
	if (isCommerceError(error)) return new PluginRouteError(error.code, error.message, error.status, error.details);
	if (error instanceof ProviderError || (error instanceof Error && error.name === "ProviderError")) {
		const providerError = error as ProviderError;
		log.warn("Payment provider call failed", { message: providerError.message, code: providerError.providerCode, isRetryable: providerError.isRetryable });
		return new PluginRouteError("PROVIDER_ERROR", PROVIDER_ERROR_MESSAGE, 502, { isRetryable: providerError.isRetryable });
	}
	log.error("Commerce route failed", { error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : String(error) });
	return new PluginRouteError("INTERNAL", INTERNAL_MESSAGE, 500);
};

export type ContainerFactory = (ctx: RouteContext) => CommerceContainer;

export const runRoute = async <TInput, TOutput>(
	spec: RouteSpec<TInput, TOutput>,
	ctx: RouteContext,
	createContainer: ContainerFactory,
): Promise<TOutput> => {
	try {
		const input = parseInput(spec.schema, ctx.input);
		const container = createContainer(ctx);
		if (!spec.skipReady) await container.ensureReady();
		if (spec.rateLimit && ctx.requestMeta.ip) {
			const allowed = await container.rateLimiter.hit(`${spec.rateLimit.name}:${ctx.requestMeta.ip}`, spec.rateLimit.limit(container.options), spec.rateLimit.windowMs);
			if (!allowed) throw new CommerceError("rateLimited", "Too many requests. Try again shortly.");
		}
		return await spec.handler({ ctx, container, input, cartId: extractCartId(ctx.request) });
	} catch (error) {
		throw toRouteError(error, ctx.log);
	}
};
