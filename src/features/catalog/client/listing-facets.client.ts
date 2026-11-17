// Keeps the filter panel honest while it is open: when a choice changes, the "Show N results" button and the number
// beside every option are recomputed in the browser from the page's embedded facets, with the same pure functions
// the server used for the first render. Nothing is fetched and nothing is submitted until the shopper presses the
// button. The panel itself (opening, closing, resetting) is the design system's `listing-filters` script; the two
// meet at the form's `change` event, which that script also fires when it resets an unapplied panel.
import { FACETS_SCRIPT_ID, FILTER_GROUPS, LISTING_PARAMS, type FilterGroupId } from "../domain/constants";
import { countMatching, countOption, parseFacets, type ItemFacet } from "../domain/facets";
import { parseListing } from "../domain/params";

const GROUP_OF_PARAM: Readonly<Record<string, FilterGroupId>> = {
	[LISTING_PARAMS.inStock]: FILTER_GROUPS.inStock,
	[LISTING_PARAMS.size]: FILTER_GROUPS.size,
	[LISTING_PARAMS.brand]: FILTER_GROUPS.brand,
	[LISTING_PARAMS.price]: FILTER_GROUPS.price,
};

const ZERO_FORM = "zero";

const paramsOf = (form: HTMLFormElement): URLSearchParams => {
	const params = new URLSearchParams();
	for (const [name, value] of new FormData(form)) if (typeof value === "string") params.append(name, value);
	return params;
};

const readForms = (button: HTMLElement): Record<string, string> => {
	try {
		const parsed: unknown = JSON.parse(button.dataset.resultsForms ?? "{}");
		return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, string>) : {};
	} catch {
		return {};
	}
};

/** The button's text for a count: "no results" at zero, otherwise the plural form of the page's language. */
export const resultsText = (forms: Readonly<Record<string, string>>, count: number, lang: string): string => {
	const category = count === 0 && forms[ZERO_FORM] ? ZERO_FORM : new Intl.PluralRules(lang).select(count);
	return (forms[category] ?? forms.other ?? String(count)).replace("{count}", String(count));
};

const updateOptions = (form: HTMLFormElement, facets: readonly ItemFacet[], params: URLSearchParams) => {
	const state = parseListing(params);
	for (const input of form.querySelectorAll<HTMLInputElement>("input[name]")) {
		const group = GROUP_OF_PARAM[input.name];
		const label = input.closest("label");
		const counter = label?.querySelector("[data-filter-count]");
		if (!group || !label || !counter) continue;
		const count = countOption(facets, state, group, input.value);
		counter.textContent = String(count);
		label.toggleAttribute("data-is-empty", count === 0 && !input.checked);
	}
};

const mount = (form: HTMLFormElement) => {
	if (form.dataset.facetsMounted) return;
	form.dataset.facetsMounted = "true";
	const facets = parseFacets(document.getElementById(FACETS_SCRIPT_ID)?.textContent);
	const button = form.querySelector<HTMLElement>("[data-filters-results]");
	const buttonLabel = button?.querySelector(".button__label") ?? button;
	if (facets.length === 0 || !button || !buttonLabel) return;
	const forms = readForms(button);

	const update = () => {
		const params = paramsOf(form);
		const total = countMatching(facets, parseListing(params));
		buttonLabel.textContent = resultsText(forms, total, document.documentElement.lang || "en");
		updateOptions(form, facets, params);
	};
	form.addEventListener("change", update);
	// A page restored from the back/forward cache keeps the form's checked state: show the counts that match it.
	window.addEventListener("pageshow", update);
	update();
};

export const mountListingFacets = (scope: ParentNode = document) => {
	for (const form of scope.querySelectorAll<HTMLFormElement>("form[data-listing-filters-form]")) mount(form);
};

mountListingFacets();
