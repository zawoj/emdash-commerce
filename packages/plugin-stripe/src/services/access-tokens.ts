import { CommerceError } from "../core/errors.js";
import { fromBase64Url, toBase64Url } from "../core/ids.js";
import type { CommerceContainer } from "../plugin/container.js";

/**
 * Signed, expiring links that let a guest view an order and open the Stripe Customer Portal. A token is
 * `base64url(JSON { v, oid, scp, exp })` + "." + `base64url(HMAC-SHA256(secret, firstPart))`. Web Crypto only
 * (runs on Workers). The secret is the `accessTokenSecret` setting; changing it invalidates every link out.
 */

export const ACCESS_SCOPE = {
	orderView: "order:view",
	portal: "portal",
} as const;
export type AccessScope = (typeof ACCESS_SCOPE)[keyof typeof ACCESS_SCOPE];

const TOKEN_VERSION = 1;
const DAY_SECONDS = 24 * 60 * 60;
const encoder = new TextEncoder();

export interface AccessTokenClaims {
	orderId: string;
	scopes: AccessScope[];
	/** Seconds since epoch. */
	expiresAt: number;
}

interface WirePayload {
	v: number;
	oid: string;
	scp: string[];
	exp: number;
}

const hmacKey = (secret: string, usage: "sign" | "verify"): Promise<CryptoKey> =>
	globalThis.crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);

const sign = async (secret: string, message: string): Promise<Uint8Array> =>
	new Uint8Array(await globalThis.crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), encoder.encode(message)));

/** Compares every byte regardless of where the first difference is, so timing reveals nothing about the signature. */
export const timingSafeEqual = (a: Uint8Array, b: Uint8Array): boolean => {
	let difference = a.length ^ b.length;
	const length = Math.max(a.length, b.length);
	for (let index = 0; index < length; index += 1) difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
	return difference === 0;
};

export const signAccessToken = async (input: { secret: string; orderId: string; scopes?: readonly AccessScope[]; now: Date; ttlDays: number }): Promise<string> => {
	const payload: WirePayload = {
		v: TOKEN_VERSION,
		oid: input.orderId,
		scp: [...(input.scopes ?? [ACCESS_SCOPE.orderView, ACCESS_SCOPE.portal])],
		exp: Math.floor(input.now.getTime() / 1000) + input.ttlDays * DAY_SECONDS,
	};
	const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
	return `${body}.${toBase64Url(await sign(input.secret, body))}`;
};

const isScope = (value: string): value is AccessScope => Object.values<string>(ACCESS_SCOPE).includes(value);

const parsePayload = (body: string): AccessTokenClaims | null => {
	try {
		const wire = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as Partial<WirePayload>;
		if (wire.v !== TOKEN_VERSION || typeof wire.oid !== "string" || !wire.oid || typeof wire.exp !== "number" || !Array.isArray(wire.scp)) return null;
		return { orderId: wire.oid, scopes: wire.scp.filter((scope): scope is AccessScope => typeof scope === "string" && isScope(scope)), expiresAt: wire.exp };
	} catch {
		return null;
	}
};

/** Null for anything wrong (malformed, bad signature, expired, missing scope): callers answer one generic 401. */
export const verifyAccessToken = async (input: { secret: string; token: string; now: Date; scope: AccessScope }): Promise<AccessTokenClaims | null> => {
	const parts = input.token.split(".");
	if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
	const [body, signature] = parts as [string, string];
	let given: Uint8Array;
	try {
		given = fromBase64Url(signature);
	} catch {
		return null;
	}
	const expected = await sign(input.secret, body);
	if (!timingSafeEqual(given, expected)) return null;
	const claims = parsePayload(body);
	if (!claims) return null;
	if (claims.expiresAt <= Math.floor(input.now.getTime() / 1000)) return null;
	return claims.scopes.includes(input.scope) ? claims : null;
};

const requireSecret = async (container: CommerceContainer): Promise<string> => {
	const secret = (await container.secrets()).accessTokenSecret;
	if (!secret) throw new CommerceError("notConfigured", "The order access token secret is not configured.");
	return secret;
};

/** A link token for one order, valid for `orders.accessTokenDays`. */
export const issueAccessToken = async (container: CommerceContainer, orderId: string, scopes?: readonly AccessScope[]): Promise<string> =>
	signAccessToken({
		secret: await requireSecret(container),
		orderId,
		...(scopes ? { scopes } : {}),
		now: container.clock.now(),
		ttlDays: container.options.orders.accessTokenDays,
	});

/** Throws 401 for any invalid token; never says why. */
export const requireAccessToken = async (container: CommerceContainer, token: string, scope: AccessScope): Promise<AccessTokenClaims> => {
	const claims = await verifyAccessToken({ secret: await requireSecret(container), token, now: container.clock.now(), scope });
	if (!claims) throw new CommerceError("unauthorized", "This link is invalid or has expired.");
	return claims;
};
