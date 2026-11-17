import { commerceMutationInit } from "../../../utils/commerce-fetch";

const FORM = "[data-order-lookup-form]";
const NOTICE = "[data-order-lookup-notice]";
const SUBMIT = "[data-order-lookup-submit]";

const setNotice = (form: HTMLFormElement, message: string): void => {
	const wrap = form.querySelector<HTMLElement>(".order-lookup__notice");
	const node = form.querySelector<HTMLElement>(NOTICE);
	if (wrap) wrap.classList.remove("order-lookup__notice--hidden");
	if (!node) return;
	const text = node.querySelector<HTMLElement>(".inline-notice__text");
	if (text) text.textContent = message;
};

const mount = (form: HTMLFormElement): void => {
	const submit = form.querySelector<HTMLButtonElement>(SUBMIT);
	form.addEventListener("submit", (event) => {
		event.preventDefault();
		if (!submit) return;
		const idleLabel = submit.textContent;
		submit.disabled = true;
		const email = (form.querySelector<HTMLInputElement>('[name="email"]')?.value ?? "").trim();
		const orderNumber = (form.querySelector<HTMLInputElement>('[name="orderNumber"]')?.value ?? "").trim();
		void (async () => {
			const res = await fetch("/api/orders/access-link", {
				...commerceMutationInit({ email, orderNumber }),
				headers: { ...commerceMutationInit().headers, accept: "application/json" },
			});
			submit.disabled = false;
			if (submit) submit.textContent = idleLabel;
			if (res.status === 429) {
				setNotice(form, form.dataset.rateLimited ?? "Too many attempts");
				return;
			}
			if (!res.ok) {
				setNotice(form, form.dataset.invalid ?? "Check the details");
				return;
			}
			if (res.ok) setNotice(form, form.dataset.success ?? "If they match, we sent a link");
		})();
	});
};

const form = document.querySelector<HTMLFormElement>(FORM);
if (form) mount(form);

export {};