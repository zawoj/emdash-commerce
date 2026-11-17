import { expect, type Page } from "@playwright/test";

import { PLUGIN_API } from "./config";

/** Adds the product on the page to the cart and waits until the plugin has accepted the line. */
export const addToCartFromProductPage = async (page: Page): Promise<void> => {
	const accepted = page.waitForResponse((response) => response.url().includes(`${PLUGIN_API}/cart/lines`) && response.request().method() === "POST");
	await page.getByTestId("add-to-cart").click();
	expect((await accepted).ok()).toBe(true);
};

export const openProduct = async (page: Page, slug: string): Promise<void> => {
	await page.goto(`/shop/${slug}`);
	// The client script marks the form once it has taken over; a click before that would post the form natively.
	await expect(page.locator("form[data-add-to-cart][data-add-to-cart-mounted='true']")).toBeAttached();
};
