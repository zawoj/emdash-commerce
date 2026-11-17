import { expect, test } from "@playwright/test";

import { CATALOG } from "../support/catalog";
import { openProduct } from "../support/cart";

const { variantProduct, bundleProduct } = CATALOG;

test.describe("product page", () => {
	test("choosing a size and a colour changes the price and the SKU", async ({ page }) => {
		await openProduct(page, variantProduct.slug);
		const state = page.locator("[data-buy-target]");
		await expect(state).toContainText(variantProduct.basePrice);
		await expect(state).toContainText(variantProduct.baseSku);

		await page.getByRole("radio", { name: "XL", exact: true }).check();
		await page.getByRole("radio", { name: "Amber", exact: true }).check();

		await expect(state).toContainText(variantProduct.xlAmberPrice);
		await expect(state).toContainText(variantProduct.xlAmberSku);
		await expect(state).not.toContainText(variantProduct.baseSku);
		await expect(page.getByTestId("add-to-cart")).toBeEnabled();
	});

	test("a size that does not exist in the chosen colour cannot be picked", async ({ page }) => {
		await openProduct(page, bundleProduct.slug);
		await page.getByRole("radio", { name: bundleProduct.missingColour, exact: true }).check();
		await expect(page.getByRole("radio", { name: bundleProduct.missingSize, exact: true })).toBeDisabled();

		await page.getByRole("radio", { name: bundleProduct.otherColour, exact: true }).check();
		await expect(page.getByRole("radio", { name: bundleProduct.missingSize, exact: true })).toBeEnabled();
	});

	test("a sold-out product cannot be added to the cart", async ({ page }) => {
		await openProduct(page, CATALOG.soldOutProduct.slug);
		await expect(page.getByTestId("add-to-cart")).toBeDisabled();
		await expect(page.getByTestId("add-to-cart")).toHaveText("Sold out");
		await expect(page.getByText("This product is sold out right now.")).toBeVisible();
	});

	test("a product that is in stock can", async ({ page }) => {
		await openProduct(page, CATALOG.simpleProduct.slug);
		await expect(page.locator("[data-buy-target]")).toContainText("In stock");
		await expect(page.getByTestId("add-to-cart")).toBeEnabled();
		await expect(page.getByTestId("add-to-cart")).toHaveText("Add to cart");
	});

	test("an unknown product is a 404 page", async ({ page }) => {
		const response = await page.goto("/shop/no-such-product");
		expect(response?.status()).toBe(404);
		await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
	});
});
