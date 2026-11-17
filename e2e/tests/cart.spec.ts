import { expect, test } from "@playwright/test";

import { CATALOG } from "../support/catalog";
import { addToCartFromProductPage, openProduct } from "../support/cart";
import { isStripeReady } from "../support/stripe-env";

const { simpleProduct } = CATALOG;

// Without a Stripe key the catalog is never synced to Stripe, so no price has a Stripe id. The plugin still takes the
// line into the cart (the cart is its own storage), but marks it "not ready for checkout" and the page keeps the
// quantity stepper and the Checkout button disabled. With a key the line is purchasable: purchase-cart.spec.ts covers it.
test.describe("cart without a Stripe key", () => {
	test.skip(isStripeReady(), "this run has a Stripe sandbox: the catalog is synced, see purchase-cart.spec.ts");

	test("adds a line that is shown but not ready for checkout", async ({ page }) => {
		await openProduct(page, simpleProduct.slug);
		await addToCartFromProductPage(page);
		await expect(page.getByRole("banner").locator("[data-count-bubble]")).toHaveText("1");
		// What a screen reader announces in the cart control's live region: singular for one item, not "1 items".
		await expect(page.getByRole("banner").getByRole("link", { name: "Cart" }).locator("[data-count-spoken]")).toHaveText("1 item in the cart");

		await page.goto("/cart");
		const line = page.getByRole("main").getByTestId("cart-line");
		await expect(line).toHaveCount(1);
		await expect(line).toContainText(simpleProduct.title);
		// The reason is said once: one warning on the line, announced once (not an unavailable text plus a second notice).
		const warning = line.getByText("This item is not ready for checkout yet.");
		await expect(warning).toHaveCount(1);
		await expect(warning).toBeVisible();
		await expect(line.getByRole("status")).toHaveCount(1);
		await expect(line.getByRole("status")).toHaveText("Warning: This item is not ready for checkout yet.");
		await expect(page.getByRole("main").getByTestId("cart-subtotal")).toHaveText(simpleProduct.price);

		// What degrades: Checkout and the quantity stepper are disabled; the line can still be removed.
		await expect(page.getByRole("main").getByTestId("cart-checkout")).toBeDisabled();
		await expect(line.getByRole("spinbutton", { name: "Quantity" })).toBeDisabled();
	});

	test("removes a line and shows the empty cart", async ({ page }) => {
		await openProduct(page, simpleProduct.slug);
		await addToCartFromProductPage(page);
		await page.goto("/cart");
		await expect(page.getByRole("main").getByTestId("cart-line")).toHaveCount(1);

		await page.getByRole("main").getByTestId("cart-line").getByRole("button", { name: /remove/i }).click();

		await expect(page.getByRole("main").getByTestId("cart-line")).toHaveCount(0);
		await expect(page.getByRole("heading", { name: "Your cart is empty" })).toBeVisible();
		await expect(page.getByRole("main").getByTestId("cart-subtotal")).toHaveCount(0);
	});
});

test.describe("empty cart", () => {
	test("is explained and links back to the shop", async ({ page }) => {
		await page.goto("/cart");
		await expect(page.getByRole("main").getByTestId("cart-line")).toHaveCount(0);
		await expect(page.getByRole("heading", { name: "Your cart is empty" })).toBeVisible();
		await expect(page.getByRole("link", { name: "Continue shopping" })).toHaveAttribute("href", "/shop");
	});
});
