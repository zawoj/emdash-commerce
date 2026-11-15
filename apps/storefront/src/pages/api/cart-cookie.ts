import type { APIRoute } from "astro";
import { CART_COOKIE } from "@emdash-commerce/plugin-stripe";
import { isValidCartId } from "../../utils/cart-id";

const MAX_AGE = 30 * 24 * 60 * 60;

// Plugin routes cannot emit Set-Cookie. The storefront stores the bearer cart id here (httpOnly);
// browser fetches use `credentials: "include"` so the plugin reads `emdash_commerce_cart` without
// exposing the id to client JS (no readable mirror cookie needed for same-origin fetches).

const isSameOriginRequest = (request: Request): boolean => {
	const fetchSite = request.headers.get("sec-fetch-site");
	if (fetchSite === "same-origin") return true;
	const origin = request.headers.get("origin");
	if (!origin) return false;
	const host = request.headers.get("host");
	if (!host) return false;
	try {
		return new URL(origin).host === host;
	} catch {
		return false;
	}
};

export const POST: APIRoute = async ({ request, cookies, url }) => {
	if (!isSameOriginRequest(request)) {
		return new Response(JSON.stringify({ ok: false, error: "CROSS_ORIGIN" }), { status: 403 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return new Response(JSON.stringify({ ok: false, error: "INVALID_JSON" }), { status: 400 });
	}
	const cartId =
		typeof body === "object" && body !== null && "cartId" in body
			? String((body as { cartId: unknown }).cartId)
			: "";
	if (!cartId || !isValidCartId(cartId)) {
		return new Response(JSON.stringify({ ok: false, error: "INVALID_CART_ID" }), { status: 400 });
	}
	cookies.set(CART_COOKIE, cartId, {
		httpOnly: true,
		sameSite: "lax",
		path: "/",
		maxAge: MAX_AGE,
		secure: url.protocol === "https:",
	});
	return new Response(JSON.stringify({ ok: true }));
};
