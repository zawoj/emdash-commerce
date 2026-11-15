import { commerceApiBase, parseApiEnvelope, persistCartFromView } from "../../../utils/commerce-fetch";
import type { CartView } from "@emdash-commerce/plugin-stripe/contracts";
import { buildCartLineBody } from "../../../utils/add-to-cart";
import { LINE_FIELDS } from "../constants";
import type { LineResponse } from "./events";

const QUANTITY_NAME = new RegExp(`^${LINE_FIELDS.quantityPrefix}\\[([^\\]]+)\\]$`);

const patchLine = async (priceId: string, quantity: number): Promise<LineResponse> => {
	const res = await fetch(`${commerceApiBase}/cart/lines`, {
		method: "POST",
		credentials: "include",
		headers: { "Content-Type": "application/json", "X-EmDash-Request": "1" },
		body: JSON.stringify(buildCartLineBody(priceId, quantity, "set")),
	});
	const json = await res.json();
	const { data, error } = parseApiEnvelope<CartView>(json);
	if (!res.ok || !data) return { ok: false, message: error?.message };
	await persistCartFromView(data);
	return { ok: true, count: data.itemCount };
};

const removeLine = async (priceId: string): Promise<LineResponse> => {
	const url = new URL(`${commerceApiBase}/cart/lines`, window.location.origin);
	url.searchParams.set("priceId", priceId);
	const res = await fetch(url, {
		method: "DELETE",
		credentials: "include",
		headers: { "X-EmDash-Request": "1" },
	});
	const json = await res.json();
	const { data, error } = parseApiEnvelope<CartView>(json);
	if (!res.ok || !data) return { ok: false, message: error?.message };
	await persistCartFromView(data);
	return { ok: true, count: data.itemCount };
};

export const bindLineActions = (
	root: HTMLElement,
	onDone: (response: LineResponse) => void | Promise<void>,
): void => {
	let queue: Promise<void> = Promise.resolve();
	const run = (task: () => Promise<LineResponse>) => {
		queue = queue.then(async () => onDone(await task()));
	};

	root.addEventListener("change", (event) => {
		const input = event.target;
		if (!(input instanceof HTMLInputElement)) return;
		const lineKey = QUANTITY_NAME.exec(input.name)?.[1];
		const quantity = Number(input.value);
		if (!lineKey || !Number.isInteger(quantity)) return;
		run(() => patchLine(lineKey, quantity));
	});

	root.addEventListener("keydown", (event) => {
		const input = event.target;
		if (event.key !== "Enter" || !(input instanceof HTMLInputElement) || !QUANTITY_NAME.test(input.name)) return;
		event.preventDefault();
		input.blur();
	});

	root.addEventListener("submit", (event) => {
		const submitter = (event as SubmitEvent).submitter;
		if (!(submitter instanceof HTMLButtonElement) || submitter.name !== LINE_FIELDS.remove) return;
		event.preventDefault();
		run(() => removeLine(submitter.value));
	});
};
