import type { CheckoutStatusView } from "@emdash-commerce/plugin-stripe/contracts";

import { checkoutCopy } from "../copy";
import {
	CHECKOUT_ORDER_NUMBER_TEST_ID,
	CHECKOUT_STATUS_TEST_ID,
	checkoutSuccessOf,
} from "../view-model";
import { commerceApiBase, parseApiEnvelope } from "../../../utils/commerce-fetch";
import type { Locale } from "../../../lib/i18n";
import { format } from "../../../lib/strings";

const ROOT = "[data-checkout-success]";
const POLL_MS = 2000;
const MAX_POLLS = 8;

const localeOf = (): Locale => (document.documentElement.lang === "pl" ? "pl" : "en");
const copyOf = () => checkoutCopy[localeOf()];

const applyModel = (root: HTMLElement, status: CheckoutStatusView): boolean => {
	const copy = copyOf();
	const model = checkoutSuccessOf(status, copy);
	const confirmation = root.querySelector<HTMLElement>("[data-checkout-confirmation]");
	if (confirmation) confirmation.dataset.tone = model.confirmation.tone ?? "success";
	const heading = root.querySelector<HTMLElement>(".order-confirmation__heading");
	if (heading) heading.textContent = model.confirmation.heading;
	const text = root.querySelector<HTMLElement>(`[data-testid="${CHECKOUT_STATUS_TEST_ID}"]`);
	if (text) text.textContent = model.confirmation.text ?? "";
	const number = root.querySelector<HTMLElement>(`[data-testid="${CHECKOUT_ORDER_NUMBER_TEST_ID}"]`);
	const numberRow = root.querySelector<HTMLElement>(".order-confirmation__fact--number dd");
	const target = number ?? numberRow;
	if (target && status.orderNumber) {
		target.textContent = status.orderNumber;
		target.setAttribute("data-testid", CHECKOUT_ORDER_NUMBER_TEST_ID);
	}
	if (!status.orderNumber && numberRow) numberRow.textContent = copy.numberPending;
	return model.isPolling;
};

const poll = async (root: HTMLElement, sessionId: string, attempt: number): Promise<void> => {
	const url = new URL(`${commerceApiBase}/checkout/status`, window.location.origin);
	url.searchParams.set("session_id", sessionId);
	const res = await fetch(url, { credentials: "include" });
	const json = await res.json();
	const { data } = parseApiEnvelope<CheckoutStatusView>(json);
	if (!data) return;
	const shouldContinue = applyModel(root, data);
	if (!shouldContinue || attempt >= MAX_POLLS) return;
	window.setTimeout(() => void poll(root, sessionId, attempt + 1), POLL_MS);
};

const mount = (root: HTMLElement): void => {
	const sessionId = root.dataset.sessionId;
	if (!sessionId) return;
	const initial = root.dataset.initialStatus;
	if (initial) {
		try {
			const parsed = JSON.parse(initial) as CheckoutStatusView;
			const shouldPoll = applyModel(root, parsed);
			if (!shouldPoll) return;
		} catch {
			return;
		}
	}
	void poll(root, sessionId, 0);
};

void format;

const root = document.querySelector<HTMLElement>(ROOT);
if (root) mount(root);

export {};