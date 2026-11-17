import { expect, test } from "@playwright/test";

import { CATALOG } from "../support/catalog";
import { addToCartFromProductPage, openProduct } from "../support/cart";
import { isStripeReady, stripeSkipReason } from "../support/stripe-env";

const { simpleProduct } = CATALOG;

// With the catalog synced to Stripe the line is purchasable: the quantity stepper and Checkout work. (Without a key
// they are disabled, see cart.spec.ts.) Nothing here starts a Checkout Session.
test.describe("cart with a synced catalog", () => {
	test.skip(!isStripeReady(), `Stripe suite skipped: ${stripeSkipReason()}`);

	test("changes a quantity, updates the subtotal and removes the line", async ({ page }) => {
		await openProduct(page, simpleProduct.slug);
		await addToCartFromProductPage(page);
		await page.goto("/cart");

		const line = page.getByRole("main").getByTestId("cart-line");
		await expect(line).toHaveCount(1);
		await expect(line.getByText("This item is not ready for checkout yet.")).toHaveCount(0);
		await expect(page.getByRole("main").getByTestId("cart-checkout")).toBeEnabled();
		await expect(page.getByRole("main").getByTestId("cart-subtotal")).toHaveText("$9.00");

		await line.locator('[data-quantity-step="1"]').click();
		await expect(line.getByRole("spinbutton", { name: "Quantity" })).toHaveValue("2");
		await expect(page.getByRole("main").getByTestId("cart-subtotal")).toHaveText("$18.00");

		await line.locator('[data-quantity-step="-1"]').click();
		await expect(line.getByRole("spinbutton", { name: "Quantity" })).toHaveValue("1");
		await expect(page.getByRole("main").getByTestId("cart-subtotal")).toHaveText("$9.00");

		await line.getByRole("button", { name: /remove/i }).click();
		await expect(page.getByRole("main").getByTestId("cart-line")).toHaveCount(0);
		await expect(page.getByRole("heading", { name: "Your cart is empty" })).toBeVisible();
	});
});
