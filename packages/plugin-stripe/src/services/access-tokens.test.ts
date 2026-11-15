import { describe, expect, it } from "vitest";

import { fromBase64Url, toBase64Url } from "../core/ids.js";
import { ACCESS_SCOPE, issueAccessToken, requireAccessToken, signAccessToken, timingSafeEqual, verifyAccessToken } from "./access-tokens.js";
import { createHarness } from "./payments/test-support.js";

const NOW = new Date("2026-01-15T12:00:00.000Z");
const SECRET = "a-long-enough-test-secret";
const sign = (over: Partial<Parameters<typeof signAccessToken>[0]> = {}) => signAccessToken({ secret: SECRET, orderId: "order-1", now: NOW, ttlDays: 30, ...over });
const verify = (token: string, over: Partial<Parameters<typeof verifyAccessToken>[0]> = {}) => verifyAccessToken({ secret: SECRET, token, now: NOW, scope: ACCESS_SCOPE.orderView, ...over });
const days = (count: number) => new Date(NOW.getTime() + count * 86_400_000);

describe("access tokens", () => {
	it("round-trips the order id, scopes and expiry", async () => {
		const token = await sign();
		expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
		expect(await verify(token)).toEqual({ orderId: "order-1", scopes: ["order:view", "portal"], expiresAt: Math.floor(days(30).getTime() / 1000) });
		expect(await verify(token, { scope: ACCESS_SCOPE.portal })).not.toBeNull();
		const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(token.split(".")[0]!)));
		expect(payload).toEqual({ v: 1, oid: "order-1", scp: ["order:view", "portal"], exp: Math.floor(days(30).getTime() / 1000) });
	});

	it("expires at the configured time", async () => {
		const token = await sign({ ttlDays: 2 });
		expect(await verify(token, { now: days(2) })).toBeNull();
		expect(await verify(token, { now: new Date(days(2).getTime() - 1_000) })).not.toBeNull();
		expect(await verify(token, { now: days(400) })).toBeNull();
	});

	it("rejects a tampered payload or signature, another secret, and malformed input", async () => {
		const token = await sign();
		const [body, signature] = token.split(".") as [string, string];
		const forged = toBase64Url(new TextEncoder().encode(JSON.stringify({ v: 1, oid: "order-2", scp: ["order:view"], exp: 9_999_999_999 })));
		expect(await verify(`${forged}.${signature}`)).toBeNull();
		expect(await verify(`${body}.${signature.slice(0, -2)}AA`)).toBeNull();
		expect(await verify(`${body}.`)).toBeNull();
		expect(await verify(token, { secret: "another-secret" })).toBeNull();
		for (const bad of ["", "nodot", "a.b.c", ".sig", `${body}.%%%`, `${body}.${signature}.extra`]) expect(await verify(bad)).toBeNull();
	});

	it("rejects a token that lacks the required scope, and unknown scopes are dropped", async () => {
		const viewOnly = await sign({ scopes: [ACCESS_SCOPE.orderView] });
		expect(await verify(viewOnly, { scope: ACCESS_SCOPE.portal })).toBeNull();
		expect(await verify(viewOnly)).not.toBeNull();
	});

	it("compares signatures in constant time over the whole length, including different lengths", () => {
		expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
		expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false);
		expect(timingSafeEqual(new Uint8Array([9, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(false);
		expect(timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 0]))).toBe(false);
		expect(timingSafeEqual(new Uint8Array([]), new Uint8Array([]))).toBe(true);
	});
});

describe("container helpers", () => {
	it("issue a token with the configured lifetime and require it back", async () => {
		const h = createHarness({ options: { orders: { accessTokenDays: 3 } } });
		const token = await issueAccessToken(h.container, "order-7");
		expect(await requireAccessToken(h.container, token, ACCESS_SCOPE.orderView)).toMatchObject({ orderId: "order-7", expiresAt: Math.floor((h.container.clock.now().getTime() + 3 * 86_400_000) / 1000) });
		h.world.clock.advance(3 * 86_400_000);
		await expect(requireAccessToken(h.container, token, ACCESS_SCOPE.orderView)).rejects.toMatchObject({ kind: "unauthorized", status: 401 });
		await expect(requireAccessToken(h.container, "garbage", ACCESS_SCOPE.portal)).rejects.toMatchObject({ kind: "unauthorized" });
	});

	it("refuse to work without a secret", async () => {
		const h = createHarness();
		h.setSecrets({ accessTokenSecret: null });
		await expect(issueAccessToken(h.container, "o")).rejects.toMatchObject({ kind: "notConfigured" });
		await expect(requireAccessToken(h.container, "x.y", ACCESS_SCOPE.portal)).rejects.toMatchObject({ kind: "notConfigured" });
	});
});
