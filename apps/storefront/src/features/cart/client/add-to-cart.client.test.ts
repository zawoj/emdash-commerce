import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const addPriceToCart = vi.fn();
vi.mock("../../../utils/add-to-cart", () => ({ addPriceToCart }));
vi.mock("@emdash-commerce/design-system/variant-picker", () => ({ revealMissingVariant: vi.fn() }));

const FORM = `
<form data-add-to-cart data-label-adding="Adding…" data-label-added="Added" data-message-failed="Could not add" data-message-choose-variant="Choose">
	<input data-default-price value="price_1" />
	<input name="quantity" value="2" />
	<button type="submit" data-add-to-cart-button>Add to cart</button>
	<div data-add-to-cart-status></div>
</form>`;

const flush = async () => {
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
};

const mountForm = async () => {
	document.body.innerHTML = FORM;
	vi.resetModules();
	await import("./add-to-cart.client");
	const form = document.querySelector<HTMLFormElement>("form")!;
	const button = form.querySelector<HTMLButtonElement>("button")!;
	return { form, button, status: form.querySelector<HTMLElement>("[data-add-to-cart-status]")! };
};

describe("add-to-cart client feedback", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		addPriceToCart.mockReset();
	});
	afterEach(() => vi.useRealTimers());

	it("says Adding while the request runs, then Added, then restores the label", async () => {
		let resolve: (value: { ok: boolean }) => void = () => undefined;
		addPriceToCart.mockReturnValue(new Promise((r) => (resolve = r)));
		const { form, button } = await mountForm();

		form.dispatchEvent(new Event("submit", { cancelable: true }));
		expect(button.textContent).toBe("Adding…");
		expect(button.disabled).toBe(true);
		expect(addPriceToCart).toHaveBeenCalledWith("price_1", 2);

		resolve({ ok: true });
		await flush();
		expect(button.textContent).toBe("Added");
		expect(button.disabled).toBe(false);

		vi.advanceTimersByTime(2000);
		expect(button.textContent).toBe("Add to cart");
	});

	it("restores the label and reports the failure when the cart refuses the line", async () => {
		addPriceToCart.mockResolvedValue({ ok: false });
		const { form, button, status } = await mountForm();

		form.dispatchEvent(new Event("submit", { cancelable: true }));
		await flush();
		expect(button.textContent).toBe("Add to cart");
		expect(status.textContent).toBe("Could not add");
	});
	it("a second click inside the Added window still ends on the idle label, even when its request is slow", async () => {
		const { form, button } = await mountForm();
		addPriceToCart.mockResolvedValueOnce({ ok: true });
		form.dispatchEvent(new Event("submit", { cancelable: true }));
		await flush();
		vi.advanceTimersByTime(1000);
		expect(button.textContent).toBe("Added");

		let resolveSecond: (value: { ok: boolean }) => void = () => undefined;
		addPriceToCart.mockReturnValueOnce(new Promise((r) => (resolveSecond = r)));
		form.dispatchEvent(new Event("submit", { cancelable: true }));
		vi.advanceTimersByTime(1500);
		resolveSecond({ ok: true });
		await flush();
		expect(button.textContent).toBe("Added");

		vi.advanceTimersByTime(5000);
		expect(button.textContent).toBe("Add to cart");
	});

	it("a failed second click shows the idle label, not the Added of the first one", async () => {
		const { form, button, status } = await mountForm();
		addPriceToCart.mockResolvedValueOnce({ ok: true });
		form.dispatchEvent(new Event("submit", { cancelable: true }));
		await flush();
		expect(button.textContent).toBe("Added");

		addPriceToCart.mockResolvedValueOnce({ ok: false });
		form.dispatchEvent(new Event("submit", { cancelable: true }));
		await flush();
		expect(button.textContent).toBe("Add to cart");
		expect(status.textContent).toBe("Could not add");
	});

	it("follows a variant that became sold out while the request ran: it stays disabled and says so", async () => {
		const { form, button } = await mountForm();
		let resolve: (value: { ok: boolean }) => void = () => undefined;
		addPriceToCart.mockReturnValue(new Promise((r) => (resolve = r)));
		form.dispatchEvent(new Event("submit", { cancelable: true }));

		// product-buy.client.ts does this when the shopper picks another variant meanwhile.
		form.dataset.labelIdle = "Sold out";
		form.dataset.isPurchasable = "false";
		resolve({ ok: true });
		await flush();

		expect(button.disabled).toBe(true);
		expect(button.textContent).toBe("Sold out");
	});

	it("returns to the label the variant script set, not to the one the page loaded with", async () => {
		const { form, button } = await mountForm();
		form.dataset.labelIdle = "Add to bag";
		addPriceToCart.mockResolvedValue({ ok: false });
		form.dispatchEvent(new Event("submit", { cancelable: true }));
		await flush();
		expect(button.textContent).toBe("Add to bag");
	});
});
