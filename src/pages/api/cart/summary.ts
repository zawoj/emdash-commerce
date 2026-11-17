import type { APIRoute } from "astro";
import { experimental_AstroContainer } from "astro/container";

import MiniCartFragment from "../../../features/cart/components/MiniCartFragment.astro";
import { SUMMARY_HTML_PARAM } from "../../../features/cart/constants";
import { loadSummary, miniCartId } from "../../../features/cart/summary";
import { resolveLocale } from "../../../lib/i18n";
import { resolveShellLocale, shellCopy } from "../../../features/shell/copy";
import { getSiteLocale } from "../../../utils/locale";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
	const locale = resolveLocale(getSiteLocale());
	const shellLocale = resolveShellLocale(locale);
	const copy = shellCopy[shellLocale];
	const summary = await loadSummary(request, locale);
	const isHtmlWanted = new URL(request.url).searchParams.get(SUMMARY_HTML_PARAM) === "1";
	let html: string | undefined;
	if (isHtmlWanted) {
		const container = await experimental_AstroContainer.create();
		html = await container.renderToString(MiniCartFragment, {
			props: {
				id: miniCartId(),
				copy,
				summary,
				checkoutAction: "/api/cart/checkout",
				cartAction: "/api/cart/lines",
			},
		});
	}
	return new Response(JSON.stringify({ ...summary, html }), {
		headers: { "content-type": "application/json" },
	});
};
