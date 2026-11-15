import { syncVariantChips } from "@emdash-commerce/design-system/variant-choice";

interface BuyVariant {
	id: number;
	options: Record<string, string>;
	isPurchasable: boolean;
	priceId: string;
}

interface BuyState {
	axes: string[];
	imageAxis: string | null;
	variants: BuyVariant[];
}

const mount = (root: HTMLElement) => {
	if (root.dataset.buyMounted) return;
	root.dataset.buyMounted = "true";
	const state = JSON.parse(root.dataset.buyState ?? "{}") as BuyState;
	if (!state.variants) return;
	const target = root.querySelector<HTMLElement>("[data-buy-target]");
	const idField = root.querySelector<HTMLInputElement>("input[data-price-id]");
	const submit = root.querySelector<HTMLButtonElement>("form[data-add-to-cart] button[type='submit']");
	const gallery = document.querySelector<HTMLElement>("[data-product-gallery]");
	const addLabel = root.dataset.addLabel ?? "";
	const soldOutLabel = root.dataset.soldOutLabel ?? "";

	const refresh = (isInitial = false) => {
		const { chosen, isComplete, variant } = syncVariantChips(root, state, isInitial);
		const resolved = variant ? state.variants.find((row) => row.id === variant.id) : undefined;
		if (idField) idField.value = resolved?.priceId ?? "";
		if (resolved && target) {
			const template = root.querySelector<HTMLTemplateElement>(`template[data-buy-template="${resolved.id}"]`);
			if (template) target.replaceChildren(template.content.cloneNode(true));
		}
		if (submit && isComplete) submit.removeAttribute("aria-disabled");
		if (submit && !isComplete) submit.setAttribute("aria-disabled", "true");
		if (submit && resolved) {
			submit.disabled = !resolved.isPurchasable;
			submit.textContent = resolved.isPurchasable ? addLabel : soldOutLabel;
		}
		if (state.imageAxis && gallery) {
			gallery.dispatchEvent(new CustomEvent("product-gallery:filter", { detail: { group: chosen[state.imageAxis] ?? null } }));
		}
	};

	root.addEventListener("variant:change", () => refresh());
	refresh(true);
};

for (const root of document.querySelectorAll<HTMLElement>("[data-product-buy]")) mount(root);

export {};
