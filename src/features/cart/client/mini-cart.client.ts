import { mountQuantitySteppers } from "@emdash-commerce/design-system/quantity-stepper";

import { CART_API, CART_EVENTS, SUMMARY_HTML_PARAM } from "../constants";
import { announceCartChange, openMiniCart, pageLocale, type CartChangedDetail } from "./events";
import { bindLineActions } from "./line-actions";

const DRAWER = "dialog[data-mini-cart]";
const PANEL = ".mini-cart__panel";
const CLOSE = "[data-mini-cart-close]";

interface SummaryBody {
	count?: number;
	html?: string;
}

const fetchSummary = async (): Promise<SummaryBody | null> => {
	const params = new URLSearchParams({ [SUMMARY_HTML_PARAM]: "1", locale: pageLocale() });
	try {
		const response = await fetch(`${CART_API.summary}?${params.toString()}`, {
			credentials: "same-origin",
			headers: { accept: "application/json" },
		});
		return response.ok ? ((await response.json()) as SummaryBody) : null;
	} catch {
		return null;
	}
};

const swapPanel = (drawer: HTMLDialogElement, html: string): void => {
	const fresh = new DOMParser().parseFromString(html, "text/html").querySelector(PANEL);
	const current = drawer.querySelector(PANEL);
	if (!fresh || !current) return;
	const hadFocus = drawer.contains(document.activeElement);
	current.replaceWith(fresh);
	mountQuantitySteppers(drawer);
	if (drawer.open && hadFocus) drawer.querySelector<HTMLElement>(CLOSE)?.focus();
};

const refresh = async (drawer: HTMLDialogElement, shouldOpen: boolean): Promise<void> => {
	const summary = await fetchSummary();
	if (!summary) return;
	if (summary.html) swapPanel(drawer, summary.html);
	if (typeof summary.count === "number") announceCartChange({ count: summary.count, isFromSummary: true });
	if (shouldOpen) openMiniCart();
};

const mount = (drawer: HTMLDialogElement): void => {
	drawer.addEventListener("click", (event) => {
		if ((event.target as Element).closest(CLOSE)) drawer.close();
	});
	bindLineActions(drawer, async (response) => {
		if (typeof response.count === "number") announceCartChange({ count: response.count, isFromSummary: false });
		else await refresh(drawer, false);
	});
	document.addEventListener(CART_EVENTS.changed, (event) => {
		const detail = (event as CustomEvent<CartChangedDetail>).detail;
		if (detail?.isFromSummary) return;
		void refresh(drawer, detail?.shouldOpenDrawer === true);
	});
	window.addEventListener("pageshow", (event) => {
		if (event.persisted) void refresh(drawer, false);
	});
	void refresh(drawer, false);
};

const drawer = document.querySelector<HTMLDialogElement>(DRAWER);
if (drawer) mount(drawer);

export {};
