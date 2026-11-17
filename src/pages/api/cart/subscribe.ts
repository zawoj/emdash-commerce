import type { APIRoute } from "astro";

import { CART_COOKIE, type CartView, type CheckoutView } from "@emdash-commerce/plugin-stripe/contracts";
import { commerceApiBase, parseApiEnvelope } from "../../../utils/commerce-fetch";
import { buildCartLineBody } from "../../../utils/add-to-cart";

const CART_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

export const prerender = false;

/** Adds a subscription price to the visitor cart and redirects to Stripe Checkout. */
export const GET: APIRoute = async ({ request, url, cookies }) => {
	const priceId = url.searchParams.get("priceId");
	if (!priceId) return new Response("Missing priceId", { status: 400 });
	const origin = new URL(request.url).origin;
	const lineRes = await fetch(`${origin}${commerceApiBase}/cart/lines`, {
		method: "POST",
		credentials: "include",
		headers: {
			"Content-Type": "application/json",
			"X-EmDash-Request": "1",
			cookie: request.headers.get("cookie") ?? "",
		},
		body: JSON.stringify(buildCartLineBody(priceId, 1, "set")),
	});
	const lineJson = await lineRes.json();
	const { data: cart } = parseApiEnvelope<CartView>(lineJson);
	if (!lineRes.ok || !cart) return new Response("Could not prepare subscription", { status: 502 });
	const checkoutRes = await fetch(`${origin}${commerceApiBase}/checkout`, {
		method: "POST",
		credentials: "include",
		headers: {
			"Content-Type": "application/json",
			"X-EmDash-Request": "1",
			"x-commerce-cart": cart.cartId,
			cookie: request.headers.get("cookie") ?? "",
		},
		body: JSON.stringify({ uiMode: "hosted" }),
	});
	const checkoutJson = await checkoutRes.json();
	const { data } = parseApiEnvelope<CheckoutView>(checkoutJson);
	if (!checkoutRes.ok || !data?.url) return new Response("Checkout unavailable", { status: 502 });
	if (cart.isNew) {
		cookies.set(CART_COOKIE, cart.cartId, {
			httpOnly: true,
			sameSite: "lax",
			path: "/",
			maxAge: CART_COOKIE_MAX_AGE,
			secure: url.protocol === "https:",
		});
	}
	return Response.redirect(data.url, 303);
};
