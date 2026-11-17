import { mountQuantitySteppers } from "@emdash-commerce/design-system/quantity-stepper";

import { CHECKOUT_NOTICE_PARAM } from "../checkout-notice";
import { CART_API, CART_PAGE_FORM_ID } from "../constants";
import { announceCartChange } from "./events";
import { bindLineActions } from "./line-actions";
import { commerceApiBase, parseApiEnvelope } from "../../../utils/commerce-fetch";
import type { Locale } from "../../../lib/i18n";
import { cartStrings } from "../../../lib/strings";

const ROOT = "[data-cart-page]";
const FRAGMENT = "[data-cart-page-fragment]";
const CHECKOUT = "[data-cart-checkout]";

const localeOf = (): Locale => (document.documentElement.lang === "pl" ? "pl" : "en");
const copyOf = () => cartStrings(localeOf());

const swapFragment = (root: HTMLElement, html: string): void => {
	const parsed = new DOMParser().parseFromString(html, "text/html");
	const fresh = parsed.querySelector(FRAGMENT);
	const current = root.querySelector(FRAGMENT);
	if (!fresh || !current) return;
	current.replaceWith(fresh);
	mountQuantitySteppers(root);
};

const refresh = async (root: HTMLElement): Promise<void> => {
	const response = await fetch(CART_API.fragment, {
		credentials: "same-origin",
		headers: { accept: "application/json" },
	});
	if (!response.ok) return;
	const body = (await response.json()) as { html?: string };
	if (body.html) swapFragment(root, body.html);
};

const startCheckout = async (root: HTMLElement, button: HTMLButtonElement): Promise<void> => {
	const copy = copyOf();
	button.disabled = true;
	const label = button.textContent;
	button.textContent = copy.checkoutStarting;
	const res = await fetch(`${commerceApiBase}/checkout`, {
		method: "POST",
		credentials: "include",
		headers: { "Content-Type": "application/json", "X-EmDash-Request": "1" },
		body: JSON.stringify({ uiMode: "hosted" }),
	});
	const json = await res.json();
	const { data, error } = parseApiEnvelope<{ url: string | null }>(json);
	if (res.status === 429) {
		await refresh(root);
		void error;
		button.disabled = false;
		button.textContent = label;
		return;
	}
	if (res.status === 409) {
		await refresh(root);
		button.disabled = false;
		button.textContent = label;
		return;
	}
	if (data?.url) {
		window.location.href = data.url;
		return;
	}
	await refresh(root);
	button.disabled = false;
	button.textContent = label;
};

const bindCheckout = (root: HTMLElement): void => {
	root.querySelectorAll<HTMLButtonElement>(CHECKOUT).forEach((button) => {
		button.replaceWith(button.cloneNode(true));
	});
	root.querySelectorAll<HTMLButtonElement>(CHECKOUT).forEach((button) => {
		button.addEventListener("click", () => void startCheckout(root, button));
	});
};

const bindLines = (root: HTMLElement): void => {
	bindLineActions(root, async (response) => {
		if (response.ok && typeof response.count === "number") announceCartChange({ count: response.count });
		await refresh(root);
		bindCheckout(root);
	});
};

const showCheckoutNotice = (root: HTMLElement): void => {
	const url = new URL(window.location.href);
	if (!url.searchParams.has(CHECKOUT_NOTICE_PARAM)) return;
	url.searchParams.delete(CHECKOUT_NOTICE_PARAM);
	window.history.replaceState(null, "", url);
	void root;
};

const mount = (root: HTMLElement): void => {
	bindLines(root);
	bindCheckout(root);
	mountQuantitySteppers(root);
	void showCheckoutNotice(root);
};

const root = document.querySelector<HTMLElement>(ROOT);
if (root) mount(root);

void CART_PAGE_FORM_ID;

export {};