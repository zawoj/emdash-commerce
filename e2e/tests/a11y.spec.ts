import { expect, test, type Page } from "@playwright/test";

import { CATALOG } from "../support/catalog";
import { addToCartFromProductPage, openProduct } from "../support/cart";
import { expectNoBlockingViolations } from "../support/a11y";
import { isStripeReady } from "../support/stripe-env";

// axe-core, WCAG 2.x A/AA rules, serious and critical violations fail. Phone = Playwright's viewport emulation (a
// headless window cannot be made narrower than ~500 px, see .ai/memory/headless-chrome-window-size-floor.md).
const VIEWPORTS = [
	{ name: "desktop 1280", size: { width: 1280, height: 900 } },
	{ name: "phone 390", size: { width: 390, height: 844 } },
] as const;

interface PageCase {
	name: string;
	open: (page: Page) => Promise<void>;
}

const PAGES: readonly PageCase[] = [
	{ name: "home", open: async (page) => void (await page.goto("/")) },
	{ name: "shop", open: async (page) => void (await page.goto("/shop")) },
	{ name: "product page", open: (page) => openProduct(page, CATALOG.variantProduct.slug) },
	{
		name: "cart with a line",
		open: async (page) => {
			await openProduct(page, CATALOG.simpleProduct.slug);
			await addToCartFromProductPage(page);
			await page.goto("/cart");
		},
	},
	{ name: "order lookup", open: async (page) => void (await page.goto("/orders/lookup")) },
];

for (const viewport of VIEWPORTS) {
	test.describe(`accessibility at ${viewport.name}`, () => {
		test.use({ viewport: viewport.size });

		for (const entry of PAGES) {
			test(`${entry.name} has no serious or critical violations`, async ({ page }) => {
				await entry.open(page);
				await expectNoBlockingViolations(page);
			});
		}

		// The dimmed states (reduced-opacity text once failed colour contrast) must really be on the page, or the strict
		// check above proves nothing about them.
		test("shop: a sold-out card meets colour contrast", async ({ page }) => {
			await page.goto("/shop");
			await expect(page.locator(".product-card--sold-out").first()).toBeVisible();
			await expectNoBlockingViolations(page);
		});

		test("cart: a line that is not ready for checkout meets colour contrast", async ({ page }) => {
			// Without a Stripe key nothing is synced, so the line is unavailable; with a sandbox it is purchasable.
			test.skip(isStripeReady(), "this run has a Stripe sandbox: the line is purchasable, so there is no dimmed line to check");
			await openProduct(page, CATALOG.simpleProduct.slug);
			await addToCartFromProductPage(page);
			await page.goto("/cart");
			await expect(page.getByRole("main").locator(".cart-line--unavailable")).toHaveCount(1);
			await expectNoBlockingViolations(page);
		});
	});
}
