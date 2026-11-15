import { PluginRouteError } from "emdash";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { CART_COOKIE, CART_HEADER } from "../contracts/api.js";
import { commerceOptionsSchema } from "../contracts/options.js";
import { CommerceError } from "../core/errors.js";
import { ProviderError } from "../ports/payment-provider.js";
import { buildCollectionDefinitions } from "../adapters/emdash/schema/collections.js";
import { createFakePluginContext, createFakeRouteContext } from "../testing/index.js";
import { createContainer } from "./container.js";
import { extractCartId, parseCookie, parseInput, runRoute, toRouteError, type RouteSpec } from "./http.js";
import { resetEnsureSchemaMemo } from "../adapters/emdash/schema/reconcile.js";
import { createReadySchemaPort } from "../testing/fakes/schema-port.js";

const options = commerceOptionsSchema.parse({});
const definitions = buildCollectionDefinitions(options.collections, options.supportedCurrencies);
const CART = "A".repeat(32);

const harness = (routeOver: Parameters<typeof createFakeRouteContext>[1] = {}) => {
	resetEnsureSchemaMemo();
	const base = createFakePluginContext(definitions);
	const ctx = createFakeRouteContext(base, routeOver);
	const containers: ReturnType<typeof createContainer>[] = [];
	const factory = () => {
		const container = createContainer(ctx, options, {}, { createSchemaPort: async () => createReadySchemaPort(definitions) });
		containers.push(container);
		return container;
	};
	return { base, ctx, factory, containers };
};

const run = <I, O>(spec: RouteSpec<I, O>, over: Parameters<typeof createFakeRouteContext>[1] = {}) => {
	const { ctx, factory, base } = harness(over);
	return { result: runRoute(spec, ctx, factory), base };
};

const caught = async (promise: Promise<unknown>): Promise<PluginRouteError> => {
	try {
		await promise;
	} catch (error) {
		return error as PluginRouteError;
	}
	throw new Error("expected the route to throw");
};

describe("cart id extraction", () => {
	const request = (headers: Record<string, string>) => ({ headers: new Headers(headers) });

	it("prefers the header, then the cookie, and only accepts well-formed ids", () => {
		expect(extractCartId(request({ [CART_HEADER]: CART }))).toBe(CART);
		expect(extractCartId(request({ cookie: `a=b; ${CART_COOKIE}=${CART}; c=d` }))).toBe(CART);
		expect(extractCartId(request({ [CART_HEADER]: "B".repeat(32), cookie: `${CART_COOKIE}=${CART}` }))).toBe("B".repeat(32));
		expect(extractCartId(request({ [CART_HEADER]: "short", cookie: `${CART_COOKIE}=${CART}` }))).toBe(CART);
		expect(extractCartId(request({ [CART_HEADER]: "../../etc/passwd" }))).toBeNull();
		expect(extractCartId(request({}))).toBeNull();
	});

	it("parses cookies without being fooled by prefixes", () => {
		expect(parseCookie(`x${CART_COOKIE}=1; ${CART_COOKIE}=2`, CART_COOKIE)).toBe("2");
		expect(parseCookie("novalue", "novalue")).toBeNull();
		expect(parseCookie(null, "a")).toBeNull();
	});
});

describe("input validation", () => {
	it("returns parsed data (defaults and transforms applied)", () => {
		const schema = z.object({ n: z.coerce.number().default(5) });
		expect(parseInput(schema, {})).toEqual({ n: 5 });
		expect(parseInput(undefined, { anything: 1 })).toBeUndefined();
	});

	it("rejects bad input as INVALID_INPUT without echoing submitted values", async () => {
		const spec: RouteSpec<{ email: string }, string> = { schema: z.object({ email: z.string().email() }), handler: async () => "ok" };
		const error = await caught(run(spec, { method: "POST", input: { email: "super-secret-not-an-email" } }).result);
		expect(error).toMatchObject({ code: "INVALID_INPUT", status: 400, message: "Invalid request" });
		expect(JSON.stringify(error.details)).toContain("email");
		expect(JSON.stringify(error.details)).not.toContain("super-secret");
	});

	it("hands GET query input (scalar or repeated key) to the schema", async () => {
		const spec: RouteSpec<{ tag: string[] }, string[]> = { schema: z.object({ tag: z.union([z.string().transform((v) => [v]), z.array(z.string())]) }), handler: async ({ input }) => input.tag };
		expect(await run(spec, { input: { tag: "a" } }).result).toEqual(["a"]);
		expect(await run(spec, { input: { tag: ["a", "b"] } }).result).toEqual(["a", "b"]);
	});
});

describe("runRoute", () => {
	it("hands the handler its input, container and cart id", async () => {
		const spec: RouteSpec<{ x: number }, unknown> = {
			schema: z.object({ x: z.number() }),
			handler: async ({ input, cartId, container }) => ({ x: input.x, cartId, hasStore: container.options.storeName }),
		};
		const { result } = run(spec, { method: "POST", input: { x: 2 }, headers: { [CART_HEADER]: CART } });
		expect(await result).toEqual({ x: 2, cartId: CART, hasStore: "Store" });
	});

	it("reconciles the schema before the handler unless the route opts out", async () => {
		const { ctx, factory, base } = harness();
		await runRoute({ handler: async () => 1 }, ctx, factory);
		expect(await base.kv.get("state:schema-marker")).not.toBeNull();
		const second = harness();
		await runRoute({ skipReady: true, handler: async () => 1 }, second.ctx, second.factory);
		expect(await second.base.kv.get("state:schema-marker")).toBeNull();
	});

	it("rate limits by caller IP and answers 429", async () => {
		const { ctx, factory } = harness({ ip: "198.51.100.7" });
		const spec: RouteSpec<void, string> = { rateLimit: { name: "checkout", limit: () => 2, windowMs: 60_000 }, handler: async () => "ok" };
		expect(await runRoute(spec, ctx, factory)).toBe("ok");
		expect(await runRoute(spec, ctx, factory)).toBe("ok");
		expect(await caught(runRoute(spec, ctx, factory))).toMatchObject({ code: "RATE_LIMITED", status: 429 });
	});

	it("keeps separate buckets per IP and skips limiting when the IP is unknown", async () => {
		const spec: RouteSpec<void, string> = { rateLimit: { name: "x", limit: () => 1, windowMs: 60_000 }, handler: async () => "ok" };
		const a = harness({ ip: "1.1.1.1" });
		expect(await runRoute(spec, a.ctx, a.factory)).toBe("ok");
		await expect(runRoute(spec, a.ctx, a.factory)).rejects.toBeDefined();
		const none = harness({ ip: null });
		await runRoute(spec, none.ctx, none.factory);
		expect(await runRoute(spec, none.ctx, none.factory)).toBe("ok");
	});
});

describe("error mapping", () => {
	const log = { warn: () => undefined, error: () => undefined };

	it("maps a CommerceError to its code, status, message and safe details", async () => {
		const spec: RouteSpec<void, never> = {
			handler: async () => {
				throw new CommerceError("insufficientStock", "Only 2 left", { available: 2 });
			},
		};
		expect(await caught(run(spec).result)).toMatchObject({ code: "INSUFFICIENT_STOCK", status: 409, message: "Only 2 left", details: { available: 2 } });
	});

	it("maps every CommerceError kind to a real HTTP status", () => {
		for (const kind of ["invalidInput", "notConfigured", "notFound", "conflict", "rateLimited", "providerError"] as const) {
			const mapped = toRouteError(new CommerceError(kind, "m"), log);
			expect(mapped.status).toBeGreaterThanOrEqual(400);
		}
	});

	it("maps a ProviderError to 502 PROVIDER_ERROR without leaking its message", async () => {
		const warnings: unknown[] = [];
		const mapped = toRouteError(new ProviderError("card_declined for sk_live_SECRET", { isRetryable: true, providerCode: "x" }), { warn: (_m, d) => void warnings.push(d), error: () => undefined });
		expect(mapped).toMatchObject({ code: "PROVIDER_ERROR", status: 502, details: { isRetryable: true } });
		expect(mapped.message).not.toContain("SECRET");
		expect(warnings).toHaveLength(1);
	});

	it("turns an unknown error into a generic logged 500", () => {
		const errors: unknown[] = [];
		const mapped = toRouteError(new Error("ECONNREFUSED db password=hunter2"), { warn: () => undefined, error: (_m, d) => void errors.push(d) });
		expect(mapped).toMatchObject({ code: "INTERNAL", status: 500, message: "An internal error occurred" });
		expect(JSON.stringify(mapped)).not.toContain("hunter2");
		expect(JSON.stringify(errors)).toContain("ECONNREFUSED");
		expect(toRouteError("string failure", { warn: () => undefined, error: () => undefined }).status).toBe(500);
	});

	it("passes a PluginRouteError through untouched", () => {
		const original = new PluginRouteError("TEAPOT", "short and stout", 418);
		expect(toRouteError(original, log)).toBe(original);
	});

	it("uses the Stripe-not-configured error from the container only when the provider is needed", async () => {
		const noKey: RouteSpec<void, string> = { handler: async ({ container }) => (await container.provider(), "never") };
		const withoutProvider: RouteSpec<void, string> = { handler: async () => "catalog read works" };
		expect(await run(withoutProvider).result).toBe("catalog read works");
		expect(await caught(run(noKey).result)).toMatchObject({ code: "NOT_CONFIGURED", status: 503 });
	});
});
