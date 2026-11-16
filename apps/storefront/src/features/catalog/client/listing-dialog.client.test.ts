// The design system's `listing-filters` and `category-bar` scripts. The design-system package has no DOM test
// runner of its own, so they are exercised here, in the app that mounts them, against the markup the components render.
import { mountCategoryBars } from "@emdash-commerce/design-system/category-bar";
import { mountListingFilters } from "@emdash-commerce/design-system/listing-filters";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const PANEL = `
<button type="button" id="open" data-listing-filters-open aria-controls="panel">Filters</button>
<dialog id="panel" data-listing-filters>
	<form id="panel-form" action="/shop" data-listing-form data-listing-filters-form>
		<button type="button" id="close" data-filters-close>Close</button>
		<input type="hidden" name="category" value="apparel" />
		<input type="checkbox" name="brand" value="edge-desk" id="brand" />
		<label><input type="radio" name="price" value="" checked /> Any</label>
		<label><input type="radio" name="price" value="2500-4999" id="price-mid" /> $25-$50</label>
		<button type="submit">Show</button>
		<div id="inside">inside</div>
	</form>
</dialog>`;

// happy-dom has no modal dialog: a minimal one that keeps `open` and fires `close` like the browser does.
const installDialog = () => {
	const proto = window.HTMLDialogElement.prototype as unknown as Record<string, unknown>;
	proto.showModal = function (this: HTMLDialogElement) {
		this.setAttribute("open", "");
	};
	proto.close = function (this: HTMLDialogElement) {
		if (!this.hasAttribute("open")) return;
		this.removeAttribute("open");
		this.dispatchEvent(new Event("close"));
	};
};

const mount = () => {
	document.body.innerHTML = PANEL;
	mountListingFilters();
	return {
		opener: document.getElementById("open") as HTMLButtonElement,
		dialog: document.getElementById("panel") as HTMLDialogElement,
		form: document.getElementById("panel-form") as HTMLFormElement,
	};
};

describe("listing filters dialog", () => {
	beforeEach(() => installDialog());
	afterEach(() => {
		document.body.innerHTML = "";
		vi.restoreAllMocks();
	});

	it("opens from the Filters button and says so with aria-expanded", () => {
		const { opener, dialog } = mount();
		expect(opener.getAttribute("aria-expanded")).toBe("false");
		opener.click();
		expect(dialog.hasAttribute("open")).toBe(true);
		expect(opener.getAttribute("aria-expanded")).toBe("true");
	});

	it("closes from its close button and gives the focus back to the Filters button", () => {
		const { opener, dialog } = mount();
		opener.click();
		(document.getElementById("close") as HTMLElement).click();
		expect(dialog.hasAttribute("open")).toBe(false);
		expect(opener.getAttribute("aria-expanded")).toBe("false");
		expect(document.activeElement).toBe(opener);
	});

	it("closes on a click on the backdrop but not on a click inside the panel", () => {
		const { opener, dialog } = mount();
		opener.click();
		(document.getElementById("inside") as HTMLElement).click();
		expect(dialog.hasAttribute("open")).toBe(true);
		dialog.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		expect(dialog.hasAttribute("open")).toBe(false);
	});

	it("drops choices that were never applied when the panel closes, and tells the live counts", () => {
		const { opener, dialog, form } = mount();
		const changed = vi.fn();
		form.addEventListener("change", changed);
		opener.click();
		(document.getElementById("brand") as HTMLInputElement).checked = true;
		(document.getElementById("price-mid") as HTMLInputElement).checked = true;

		dialog.close();

		expect((document.getElementById("brand") as HTMLInputElement).checked).toBe(false);
		expect((document.getElementById("price-mid") as HTMLInputElement).checked).toBe(false);
		expect((form.querySelector('input[name="price"][value=""]') as HTMLInputElement).checked).toBe(true);
		expect(changed).toHaveBeenCalledTimes(1);
	});

	it("mounts a panel once, however many times the script runs", () => {
		const { opener, dialog } = mount();
		mountListingFilters();
		mountListingFilters();
		opener.click();
		dialog.close();
		expect(document.activeElement).toBe(opener);
		expect(opener.getAttribute("aria-expanded")).toBe("false");
	});
});

describe("listing form tidying", () => {
	beforeEach(() => installDialog());
	afterEach(() => {
		document.body.innerHTML = "";
		vi.restoreAllMocks();
	});

	it("keeps a blank value out of the URL", () => {
		const { form } = mount();
		const formData = new FormData(form);
		formData.set("price", "");
		formData.set("brand", "edge-desk");
		form.dispatchEvent(Object.assign(new Event("formdata"), { formData }));
		expect(formData.has("price")).toBe(false);
		expect(formData.get("brand")).toBe("edge-desk");
	});

	it("sends a form with nothing left to the bare path", () => {
		document.body.innerHTML = `<form action="/shop" data-listing-form><input type="radio" name="price" value="" checked /></form>`;
		mountListingFilters();
		const assign = vi.spyOn(window.location, "assign").mockImplementation(() => undefined);
		const event = new Event("submit", { cancelable: true });
		document.querySelector("form")!.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(true);
		expect(assign).toHaveBeenCalledWith("/shop");
	});

	it("lets a form with a value submit as it is", () => {
		const { form } = mount();
		const assign = vi.spyOn(window.location, "assign").mockImplementation(() => undefined);
		const event = new Event("submit", { cancelable: true });
		form.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(false);
		expect(assign).not.toHaveBeenCalled();
	});

	it("submits an auto-submit form (the sort) when a choice changes", () => {
		document.body.innerHTML = `<form action="/shop" data-auto-submit><select name="sort"><option value="newest">New</option></select></form>`;
		mountListingFilters();
		const form = document.querySelector("form") as HTMLFormElement;
		form.requestSubmit = vi.fn();
		form.dispatchEvent(new Event("change", { bubbles: true }));
		expect(form.requestSubmit).toHaveBeenCalledTimes(1);
	});

	it("does not submit the filter panel on change: only the button applies it", () => {
		const { form } = mount();
		form.requestSubmit = vi.fn();
		form.dispatchEvent(new Event("change", { bubbles: true }));
		expect(form.requestSubmit).not.toHaveBeenCalled();
	});
});

describe("category bar", () => {
	afterEach(() => {
		document.body.innerHTML = "";
	});

	const barWith = (sizes: { scrollWidth: number; clientWidth: number; offsetLeft: number; offsetWidth: number }) => {
		document.body.innerHTML = `<nav data-category-bar><ul class="category-bar__list"><li><a href="/shop">All</a></li><li><a href="/shop?category=sale" aria-current="true">Sale</a></li></ul></nav>`;
		const list = document.querySelector<HTMLElement>(".category-bar__list")!;
		const current = document.querySelector<HTMLElement>("[aria-current]")!;
		Object.defineProperty(list, "scrollWidth", { value: sizes.scrollWidth });
		Object.defineProperty(list, "clientWidth", { value: sizes.clientWidth });
		Object.defineProperty(current, "offsetLeft", { value: sizes.offsetLeft });
		Object.defineProperty(current, "offsetWidth", { value: sizes.offsetWidth });
		return list;
	};

	it("scrolls the row so the current pill sits in the middle", () => {
		const list = barWith({ scrollWidth: 900, clientWidth: 300, offsetLeft: 500, offsetWidth: 80 });
		mountCategoryBars();
		expect(list.scrollLeft).toBe(500 - (300 - 80) / 2);
	});

	it("leaves a row that fits alone", () => {
		const list = barWith({ scrollWidth: 300, clientWidth: 300, offsetLeft: 200, offsetWidth: 80 });
		mountCategoryBars();
		expect(list.scrollLeft).toBe(0);
	});
});
