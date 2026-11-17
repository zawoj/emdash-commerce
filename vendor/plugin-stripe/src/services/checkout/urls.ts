import type { CommerceOptions } from "../../contracts/options.js";
import { CommerceError } from "../../core/errors.js";

/** Stripe substitutes this token in `success_url` / `return_url`; it must reach Stripe unencoded. */
export const SESSION_ID_PLACEHOLDER = "{CHECKOUT_SESSION_ID}";

/** `new URL` would percent-encode the braces, so the token travels as a plain sentinel while parsing. */
const SENTINEL = "__commerce_session_id__";

const originOf = (value: string): string | null => {
	try {
		return new URL(value).origin;
	} catch {
		return null;
	}
};

/**
 * Resolves a configured path (or absolute https URL) against the site and checks the resulting origin
 * against the site's own and `allowedRedirectOrigins`. The check runs on the parsed result, so
 * `//evil.example` and `/\evil.example` (which browsers treat as another host) are caught like any
 * absolute URL.
 */
export const resolveRedirectUrl = (target: string, siteUrl: string, allowedOrigins: readonly string[]): string => {
	const resolved = (() => {
		try {
			return new URL(target.replaceAll(SESSION_ID_PLACEHOLDER, SENTINEL), siteUrl);
		} catch {
			return null;
		}
	})();
	const allowed = new Set([originOf(siteUrl), ...allowedOrigins.map(originOf)].filter((origin): origin is string => origin !== null));
	if (!resolved || !allowed.has(resolved.origin) || !/^https?:$/.test(resolved.protocol)) {
		throw new CommerceError("notConfigured", "A checkout redirect URL points outside the site's allowed origins.");
	}
	return resolved.href.replaceAll(SENTINEL, SESSION_ID_PLACEHOLDER);
};

export interface RedirectUrls {
	successUrl: string | null;
	cancelUrl: string | null;
	returnUrl: string | null;
}

/** Hosted checkout redirects to success/cancel; embedded checkout to the return URL only. */
export const buildRedirectUrls = (checkout: CommerceOptions["checkout"], siteUrl: string, uiMode: "hosted" | "embedded"): RedirectUrls => {
	const resolve = (target: string): string => resolveRedirectUrl(target, siteUrl, checkout.allowedRedirectOrigins);
	if (uiMode === "embedded") return { successUrl: null, cancelUrl: null, returnUrl: resolve(checkout.returnPath) };
	return { successUrl: resolve(checkout.successPath), cancelUrl: resolve(checkout.cancelPath), returnUrl: null };
};
