import { expect, test } from "@playwright/test";

import { CATALOG } from "../support/catalog";

// `/shop/c/{slug}` and `/shop/brand/{slug}` are the URL patterns the plugin gives a category and a brand (sitemaps and
// search results use them). The storefront sends a known slug to the filtered shop and answers an unknown one with a real 404.
test.describe("category and brand URLs", () => {
	test("a category slug answers 301 to the filtered shop", async ({ request }) => {
		const response = await request.get(`/shop/c/${CATALOG.categorySlug}`, { maxRedirects: 0 });
		expect(response.status()).toBe(301);
		const location = new URL(response.headers().location ?? "", response.url());
		expect(location.pathname + location.search).toBe(`/shop?category=${CATALOG.categorySlug}`);
	});

	test("a brand slug answers 301 to the filtered shop", async ({ request }) => {
		const response = await request.get(`/shop/brand/${CATALOG.brandSlug}`, { maxRedirects: 0 });
		expect(response.status()).toBe(301);
		const location = new URL(response.headers().location ?? "", response.url());
		expect(location.pathname + location.search).toBe(`/shop?brand=${CATALOG.brandSlug}`);
	});

	test("following the redirect lands on the narrowed list", async ({ page }) => {
		await page.goto(`/shop/brand/${CATALOG.brandSlug}`);
		await expect(page).toHaveURL(new RegExp(`/shop\\?brand=${CATALOG.brandSlug}$`));
		await expect(page.getByRole("main").getByRole("article")).toHaveCount(CATALOG.brandProductCount);
	});

	for (const path of ["/shop/c/no-such-category", "/shop/brand/no-such-brand"]) {
		test(`${path} is a real 404 with the not-found page`, async ({ page }) => {
			const response = await page.goto(path);
			expect(response?.status()).toBe(404);
			await expect(page).toHaveURL(new RegExp(`${path}$`));
			await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
		});
	}
});
