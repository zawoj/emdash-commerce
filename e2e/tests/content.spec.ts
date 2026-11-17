import { expect, test } from "@playwright/test";

import { CATALOG } from "../support/catalog";

test.describe("blog content that stays next to the shop", () => {
	test("/posts lists the posts and opens one", async ({ page }) => {
		await page.goto("/posts");
		await expect(page.getByRole("heading", { level: 1, name: "All Posts" })).toBeVisible();
		await expect(page.getByText(`${CATALOG.post.count} posts`)).toBeVisible();

		const firstPost = page.getByRole("main").getByRole("link", { name: /^(?!List layout|Grid layout)/ }).filter({ has: page.getByRole("heading") }).first();
		const title = (await firstPost.getByRole("heading").innerText()).trim();
		await firstPost.click();
		await expect(page).toHaveURL(/\/posts\/[a-z0-9-]+$/);
		await expect(page.getByRole("heading", { level: 1 })).toContainText(title);
	});

	test("/search finds a post by a word of its title and says so when nothing matches", async ({ page }) => {
		await page.goto("/posts");
		const title = (await page.getByRole("main").getByRole("heading", { level: 2 }).first().innerText()).trim();
		const word = title.split(/\s+/).find((candidate) => candidate.length > 3) ?? title;

		await page.goto(`/search?q=${encodeURIComponent(word)}`);
		await expect(page.getByRole("searchbox", { name: "Search posts" })).toHaveValue(word);
		await expect(page.getByRole("heading", { level: 2, name: /^No results/ })).toHaveCount(0);
		await expect(page.getByRole("main").getByRole("link", { name: new RegExp(title.slice(0, 12), "i") }).first()).toBeVisible();

		await page.goto("/search?q=zzzzqqqqxxxx");
		await expect(page.getByRole("heading", { level: 2, name: /^No results/ })).toBeVisible();
	});

	test("/rss.xml is a feed with items", async ({ request }) => {
		const response = await request.get("/rss.xml");
		expect(response.status()).toBe(200);
		expect(response.headers()["content-type"]).toMatch(/xml/);
		const body = await response.text();
		expect(body).toContain("<rss");
		expect(body.match(/<item>/g)?.length ?? 0).toBeGreaterThanOrEqual(1);
	});
});
