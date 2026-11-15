import type { APIRoute } from "astro";

import type { CheckoutView } from "@emdash-commerce/plugin-stripe/contracts";
import { commerceApiBase, parseApiEnvelope } from "../../../utils/commerce-fetch";

export const prerender = false;

/** Starts hosted Stripe Checkout for the visitor's current cart and redirects. */
export const GET: APIRoute = async ({ request }) => {
	const origin = new URL(request.url).origin;
	const res = await fetch(`${origin}${commerceApiBase}/checkout`, {
		method: "POST",
		credentials: "include",
		headers: {
			"Content-Type": "application/json",
			"X-EmDash-Request": "1",
			cookie: request.headers.get("cookie") ?? "",
		},
		body: JSON.stringify({ uiMode: "hosted" }),
	});
	const json = await res.json();
	const { data } = parseApiEnvelope<CheckoutView>(json);
	if (!res.ok || !data?.url) {
		return new Response("Checkout unavailable", { status: 502 });
	}
	return Response.redirect(data.url, 303);
};
