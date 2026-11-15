import { describe, expect, it } from "vitest";

import { soldOutNoteText } from "@emdash-commerce/design-system/sold-out-note";
import { syncVariantChips } from "@emdash-commerce/design-system/variant-choice";

const chip = (value: string, soldOutLabel: string) =>
	`<label class="option-chip" data-sold-out-label="${soldOutLabel}"><input class="option-chip__input" type="radio" name="option:size" value="${value}"><span class="option-chip__box"><span class="option-chip__label">${value}</span></span></label>`;

const mount = (): HTMLElement => {
	const root = document.createElement("form");
	root.innerHTML = `<div data-variant-axis>${chip("M", "Sold out")}${chip("XL", "Sold out")}</div>`;
	document.body.append(root);
	return root;
};

const state = {
	axes: ["size"],
	imageAxis: null,
	variants: [
		{ id: 1, options: { size: "M" }, isPurchasable: true },
		{ id: 2, options: { size: "XL" }, isPurchasable: false },
	],
};

const chipText = (root: HTMLElement, value: string): string =>
	root.querySelector(`input[value="${value}"]`)?.closest("label")?.textContent?.replace(/\s+/g, " ").trim() ?? "";

describe("sold-out note on option chips", () => {
	it("carries the words only on a chip that really is sold out", () => {
		const root = mount();
		syncVariantChips(root, state);
		expect(chipText(root, "M")).toBe("M");
		expect(chipText(root, "XL")).toBe(`XL${soldOutNoteText("Sold out")}`);
		expect(chipText(root, "XL")).toBe("XL, sold out");
	});

	it("removes the words again when the option is back in stock", () => {
		const root = mount();
		syncVariantChips(root, state);
		syncVariantChips(root, { ...state, variants: state.variants.map((variant) => ({ ...variant, isPurchasable: true })) });
		expect(chipText(root, "XL")).toBe("XL");
		expect(root.querySelectorAll("[data-sold-out-note]")).toHaveLength(0);
	});
});
