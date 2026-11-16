import { revealMissingVariant } from "@emdash-commerce/design-system/variant-picker";

import { addPriceToCart } from "../../../utils/add-to-cart";

/** How long the button says "Added" before it returns to its own label. */
const ADDED_FEEDBACK_MS = 1800;

/**
 * The form carries the two facts the button must return to: `data-label-idle` (what it says when nothing is
 * happening: "Add to cart", or "Sold out" for an unavailable variant) and `data-is-purchasable`. The server renders
 * them and `product-buy.client.ts` updates them when the variant changes, so this script never reads them back
 * from the button's own text (which may be "Adding..." or "Added" at that moment).
 */

const mount = (form: HTMLFormElement): void => {
	if (form.dataset.addToCartMounted) return;
	form.dataset.addToCartMounted = "true";
	const button = form.querySelector<HTMLButtonElement>("[data-add-to-cart-button]");
	const status = form.querySelector<HTMLElement>("[data-add-to-cart-status]");
	const priceField = form.dataset.priceField;
	const initialLabel = button?.textContent ?? "";
	const idleLabel = (): string => form.dataset.labelIdle ?? initialLabel;
	const isBlocked = (): boolean => form.dataset.isPurchasable === "false";
	let feedbackTimer: number | undefined;

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
		if (!button) return;
		window.clearTimeout(feedbackTimer);
		button.disabled = true;
		button.textContent = form.dataset.labelAdding ?? idleLabel();
		void addPriceToCart(priceId, quantity)
			.then((result) => {
				if (!result.ok && status) status.textContent = form.dataset.messageFailed ?? "";
				const hasAdded = result.ok && !isBlocked();
				button.textContent = hasAdded ? (form.dataset.labelAdded ?? idleLabel()) : idleLabel();
				if (hasAdded) feedbackTimer = window.setTimeout(() => (button.textContent = idleLabel()), ADDED_FEEDBACK_MS);
			})
			.catch(() => {
				if (status) status.textContent = form.dataset.messageFailed ?? "";
				button.textContent = idleLabel();
			})
			.finally(() => {
				// A variant picked while the request ran may be sold out: the button follows it, not the request.
				button.disabled = isBlocked();
			});
	});
};

for (const form of document.querySelectorAll<HTMLFormElement>("form[data-add-to-cart]")) mount(form);

export {};
