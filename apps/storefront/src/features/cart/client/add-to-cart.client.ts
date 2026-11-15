import { revealMissingVariant } from "@emdash-commerce/design-system/variant-picker";

import { addPriceToCart } from "../../../utils/add-to-cart";

const mount = (form: HTMLFormElement): void => {
	if (form.dataset.addToCartMounted) return;
	form.dataset.addToCartMounted = "true";
	const button = form.querySelector<HTMLButtonElement>("[data-add-to-cart-button]");
	const status = form.querySelector<HTMLElement>("[data-add-to-cart-status]");
	const priceField = form.dataset.priceField;

	form.addEventListener("submit", (event) => {
		event.preventDefault();
		if (button?.disabled) return;
		status?.replaceChildren();
		let priceId = "";
		if (priceField) {
			const field = form.elements.namedItem(priceField);
			priceId = field instanceof HTMLInputElement ? field.value.trim() : "";
			if (!priceId) {
				revealMissingVariant(form);
				if (status) status.textContent = form.dataset.messageChooseVariant ?? "";
				return;
			}
		} else {
			const fallback = form.querySelector<HTMLInputElement>("input[data-default-price]");
			priceId = fallback?.value ?? "";
		}
		if (!priceId) return;
		const quantity = Number((form.elements.namedItem("quantity") as HTMLInputElement | null)?.value ?? 1);
		if (button) button.disabled = true;
		void addPriceToCart(priceId, quantity).finally(() => {
			if (button) button.disabled = false;
		});
	});
};

for (const form of document.querySelectorAll<HTMLFormElement>("form[data-add-to-cart]")) mount(form);

export {};
