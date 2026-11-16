import { beforeEach, describe, expect, it } from "vitest";

import { FACETS_SCRIPT_ID } from "../domain/constants";
import { serializeFacets, type ItemFacet } from "../domain/facets";
import { mountListingFacets, resultsText } from "./listing-facets.client";

const FACETS: ItemFacet[] = [
	{ slug: "tee", categories: ["apparel"], brand: "a", sizes: ["S", "M"], price: 2800, isInStock: true },
	{ slug: "hoodie", categories: ["apparel"], brand: "b", sizes: ["M"], price: 6800, isInStock: true },
	{ slug: "pin", categories: ["stickers"], brand: "a", sizes: [], price: 800, isInStock: false },
];

const FORMS = { one: "Show 1 result", other: "Show {count} results", zero: "No results" };

const mountPanel = () => {
	document.documentElement.lang = "en";
	document.body.innerHTML = `
		<script type="application/json" id="${FACETS_SCRIPT_ID}">${serializeFacets(FACETS)}</script>
		<form data-listing-filters-form>
			<input type="hidden" name="category" value="apparel" />
			<label><input type="checkbox" name="brand" value="a" /><span data-filter-count>9</span></label>
			<label><input type="checkbox" name="brand" value="b" /><span data-filter-count>9</span></label>
			<label><input type="checkbox" name="size" value="S" /><span data-filter-count>9</span></label>
			<label><input type="checkbox" name="inStock" value="1" /><span data-filter-count>9</span></label>
			<label><input type="radio" name="price" value="" checked /><span data-filter-count>9</span></label>
			<label><input type="radio" name="price" value="5000-" /><span data-filter-count>9</span></label>
			<button type="submit" data-filters-results data-results-forms='${JSON.stringify(FORMS)}'><span class="button__label">Show 3 results</span></button>
		</form>`;
	mountListingFacets();
	const form = document.querySelector("form")!;
	const label = () => document.querySelector(".button__label")!.textContent;
	const counts = () => [...document.querySelectorAll("[data-filter-count]")].map((node) => node.textContent);
	const toggle = (selector: string) => {
		const input = document.querySelector<HTMLInputElement>(selector)!;
		input.checked = !input.checked;
		input.dispatchEvent(new Event("change", { bubbles: true }));
	};
	return { form, label, counts, toggle };
};

describe("resultsText", () => {
	it("uses the zero form at zero, else the plural form of the language", () => {
		expect(resultsText(FORMS, 0, "en")).toBe("No results");
		expect(resultsText(FORMS, 1, "en")).toBe("Show 1 result");
		expect(resultsText(FORMS, 12, "en")).toBe("Show 12 results");
		expect(resultsText({ other: "Show {count}" }, 0, "en")).toBe("Show 0");
	});
});

describe("the filter panel's live counts", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	it("corrects the first render to what the page's facets say", () => {
		const { label, counts } = mountPanel();
		// Category apparel: tee + hoodie.
		expect(label()).toBe("Show 2 results");
		expect(counts()).toEqual(["1", "1", "1", "2", "2", "1"]);
	});

	it("recounts the button and every option when a choice changes, without a request", () => {
		const { label, counts, toggle } = mountPanel();
		toggle('input[name="brand"][value="a"]');
		expect(label()).toBe("Show 1 result");
		// brand a: tee only -> size S (1), in stock (1); price 50+ option leaves 0 for brand a.
		expect(counts()).toEqual(["1", "1", "1", "1", "1", "0"]);
		toggle('input[name="size"][value="S"]');
		expect(label()).toBe("Show 1 result");
		toggle('input[name="brand"][value="a"]');
		toggle('input[name="brand"][value="b"]');
		expect(label()).toBe("No results");
	});

	it("an option that would leave nothing is marked, unless it is checked", () => {
		const { toggle } = mountPanel();
		toggle('input[name="brand"][value="a"]');
		const price50 = document.querySelector('input[value="5000-"]')!.closest("label")!;
		expect(price50.hasAttribute("data-is-empty")).toBe(true);
		expect(document.querySelector('input[name="brand"][value="a"]')!.closest("label")!.hasAttribute("data-is-empty")).toBe(false);
		// Choosing the empty option itself keeps it from being dimmed: the shopper's own choice never looks disabled.
		toggle('input[name="price"][value="5000-"]');
		expect(price50.hasAttribute("data-is-empty")).toBe(false);
	});

	it("a reset (the panel closed without applying) puts the counts back", () => {
		const { form, label, toggle } = mountPanel();
		toggle('input[name="brand"][value="a"]');
		form.reset();
		form.dispatchEvent(new Event("change", { bubbles: true }));
		expect(label()).toBe("Show 2 results");
	});

	it("leaves the server's text alone when the page carries no facets", () => {
		document.body.innerHTML = `<form data-listing-filters-form><button data-filters-results><span class="button__label">Show 7 results</span></button></form>`;
		mountListingFacets();
		expect(document.querySelector(".button__label")!.textContent).toBe("Show 7 results");
	});
});
