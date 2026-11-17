import { expect, test, type Page } from "@playwright/test";

import { CATALOG } from "../support/catalog";

const productCount = async (page: Page): Promise<number> => {
	const text = (await page.getByRole("status").filter({ hasText: /^\d+ products?$/ }).innerText()).trim();
	return Number(text.split(" ")[0]);
};

test.describe("shop", () => {
	test("lists every seeded product, and the count line matches the cards", async ({ page }) => {
		await page.goto("/shop");
		await expect(page.getByRole("heading", { level: 1, name: "Shop" })).toBeVisible();
		await expect(page.getByRole("main").getByRole("article")).toHaveCount(CATALOG.productCount);
		expect(await productCount(page)).toBe(CATALOG.productCount);
		await expect(page.getByRole("main").getByRole("link", { name: CATALOG.variantProduct.title, exact: true })).toBeVisible();
	});

	test("the category bar narrows the list and puts the category in the URL", async ({ page }) => {
		await page.goto("/shop");
		await page.getByRole("navigation", { name: "Categories" }).getByRole("link", { name: CATALOG.categoryLabel, exact: true }).click();

		await expect(page).toHaveURL(new RegExp(`[?&]category=${CATALOG.categorySlug}(&|$)`));
		const cards = page.getByRole("main").getByRole("article");
		await expect.poll(() => cards.count()).toBeLessThan(CATALOG.productCount);
		expect(await cards.count()).toBeGreaterThan(0);
		expect(await productCount(page)).toBe(await cards.count());
	});

	test("the filter dialog counts, applies a brand, carries it in the URL and lets the chip remove it", async ({ page }) => {
		await page.goto("/shop");
		await page.getByRole("button", { name: "Filters" }).click();
		const dialog = page.getByRole("dialog", { name: "Filters" });
		await expect(dialog.getByRole("button", { name: `Show ${CATALOG.productCount} results` })).toBeVisible();

		// Picking a brand updates the button's count before anything is applied.
		await dialog.getByRole("checkbox", { name: new RegExp(`^${CATALOG.brandName}`) }).check();
		const apply = dialog.getByRole("button", { name: `Show ${CATALOG.brandProductCount} results` });
		await expect(apply).toBeVisible();
		await apply.click();

		await expect(page).toHaveURL(new RegExp(`[?&]brand=${CATALOG.brandSlug}(&|$)`));
		await expect(dialog).toBeHidden();
		await expect(page.getByRole("main").getByRole("article")).toHaveCount(CATALOG.brandProductCount);
		expect(await productCount(page)).toBe(CATALOG.brandProductCount);
		await expect(page.getByRole("button", { name: "Filters 1 applied" })).toBeVisible();

		await page.getByRole("list", { name: "Applied filters" }).getByRole("link", { name: `Remove filter: ${CATALOG.brandName}` }).click();
		await expect(page).not.toHaveURL(/brand=/);
		await expect(page.getByRole("main").getByRole("article")).toHaveCount(CATALOG.productCount);
	});

	test("a filtered URL opened directly shows the same list", async ({ page }) => {
		await page.goto(`/shop?brand=${CATALOG.brandSlug}`);
		await expect(page.getByRole("main").getByRole("article")).toHaveCount(CATALOG.brandProductCount);
		await expect(page.getByRole("list", { name: "Applied filters" })).toContainText(CATALOG.brandName);
	});
});
