import { expect, test } from "@playwright/test";

test.describe("home", () => {
	test("renders the hero, the category pills and a product rail", async ({ page }) => {
		const response = await page.goto("/");
		expect(response?.status()).toBe(200);

		await expect(page.getByRole("heading", { level: 1 })).not.toBeEmpty();

		const pills = page.getByRole("navigation", { name: "Shop by category" }).getByRole("link");
		await expect(pills.first()).toBeVisible();
		expect(await pills.count()).toBeGreaterThanOrEqual(4);
		for (const href of await pills.evaluateAll((links) => links.map((link) => link.getAttribute("href")))) {
			expect(href).toMatch(/^\/shop\?category=[a-z-]+$/);
		}

		const rail = page.getByRole("region", { name: "New arrivals" });
		await expect(rail.getByRole("heading", { level: 2, name: "New arrivals" })).toBeVisible();
		const cards = rail.getByRole("article");
		await expect(cards.first()).toBeVisible();
		await expect(cards.first().getByRole("link")).toHaveAttribute("href", /^\/shop\/[a-z0-9-]+$/);
		await expect(cards.first()).toContainText(/\$\d+\.\d{2}/);
	});

	test("the header has the main menu, search and a cart link", async ({ page }) => {
		await page.goto("/");
		const header = page.getByRole("banner");
		await expect(header.getByRole("navigation", { name: "Main menu" }).getByRole("link", { name: "Shop" })).toHaveAttribute("href", "/shop");
		await expect(header.getByRole("button", { name: "Search" })).toBeVisible();
		await expect(header.getByRole("link", { name: /^Cart/ })).toHaveAttribute("href", "/cart");
	});
});
