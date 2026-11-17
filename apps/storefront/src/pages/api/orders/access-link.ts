import type { APIRoute } from "astro";

import { commerceApiBase, commerceMutationInit, parseApiEnvelope } from "../../../utils/commerce-fetch";

export const prerender = false;

/** Forwards guest order-link requests to the Stripe plugin (same response whether or not the order exists). */
export const POST: APIRoute = async ({ request }) => {
	const form = await request.formData().catch(() => null);
	const json = form
		? { email: String(form.get("email") ?? ""), orderNumber: String(form.get("orderNumber") ?? "") }
		: await request.json().catch(() => null);
	if (!json || typeof json.email !== "string" || typeof json.orderNumber !== "string") {
		return new Response("Invalid input", { status: 400 });
	}
	const init = commerceMutationInit(json);
	const res = await fetch(`${new URL(request.url).origin}${commerceApiBase}/orders/access-link`, {
		...init,
		headers: {
			...(init.headers as Record<string, string>),
			cookie: request.headers.get("cookie") ?? "",
		},
	});
	const body = await res.json();
	const { data, error } = parseApiEnvelope<{ isAccepted: true }>(body);
	if (!res.ok) {
		return new Response(JSON.stringify({ error }), {
			status: res.status,
			headers: { "content-type": "application/json" },
		});
	}
	if (!data) return new Response("Unavailable", { status: 502 });
	const accepts = request.headers.get("accept")?.includes("application/json");
	if (accepts) {
		return new Response(JSON.stringify({ ok: true, message: "accepted" }), {
			headers: { "content-type": "application/json" },
		});
	}
	return new Response(null, { status: 303, headers: { location: "/orders/lookup?sent=1" } });
};