import type { APIRoute } from "astro";
import { experimental_AstroContainer } from "astro/container";

import CartPageFragment from "../../../features/cart/components/CartPageFragment.astro";
import { loadCartPage } from "../../../features/cart/summary";
import { resolveLocale } from "../../../lib/i18n";
import { cartStrings } from "../../../lib/strings";
import { getSiteLocale } from "../../../utils/locale";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
	const locale = resolveLocale(getSiteLocale());
	const copy = cartStrings(locale);
	const model = await loadCartPage(request, locale, copy);
	if (!model) return new Response("Cart unavailable", { status: 503 });
	const container = await experimental_AstroContainer.create();
	const html = await container.renderToString(CartPageFragment, { props: { copy, model } });
	return new Response(JSON.stringify({ model, html }), {
		headers: { "content-type": "application/json" },
	});
};