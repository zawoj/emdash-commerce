import { test, type Page } from "@playwright/test";

import { CATALOG } from "../support/catalog";
import { addToCartFromProductPage, openProduct } from "../support/cart";
import { expectNoBlockingViolations } from "../support/a11y";

// axe-core, WCAG 2.x A/AA rules, serious and critical violations fail. Phone = Playwright's viewport emulation (a
// headless window cannot be made narrower than ~500 px, see .ai/memory/headless-chrome-window-size-floor.md).
const VIEWPORTS = [
	{ name: "desktop 1280", size: { width: 1280, height: 900 } },
	{ name: "phone 390", size: { width: 390, height: 844 } },
] as const;

/**
 * Known issues, left out of the page checks so the rest of each page stays guarded, and written down as `fixme` tests
 * below that run the strict check once someone fixes them. Both live in packages/design-system (out of this suite's scope).
 */
const KNOWN_ISSUES = {
	soldOutCard: {
		selector: ".product-card--sold-out",
		reason: "a sold-out product card dims its title and photo with opacity: 0.6 (product-card/index.astro), which drops the title's colour contrast below 4.5:1",
	},
	unavailableCartLine: {
		selector: ".cart-line--unavailable",
		reason: "a cart line that is not ready for checkout is dimmed with opacity: 0.55 (cart-line/index.astro), which drops the name and price contrast below 4.5:1",
	},
} as const;

interface PageCase {
	name: string;
	open: (page: Page) => Promise<void>;
	exclude?: readonly string[];
}

const PAGES: readonly PageCase[] = [
	{ name: "home", open: async (page) => void (await page.goto("/")) },
	{ name: "shop", open: async (page) => void (await page.goto("/shop")), exclude: [KNOWN_ISSUES.soldOutCard.selector] },
	{ name: "product page", open: (page) => openProduct(page, CATALOG.variantProduct.slug) },
	{
		name: "cart with a line",
		open: async (page) => {
			await openProduct(page, CATALOG.simpleProduct.slug);
			await addToCartFromProductPage(page);
			await page.goto("/cart");
		},
		exclude: [KNOWN_ISSUES.unavailableCartLine.selector],
	},
	{ name: "order lookup", open: async (page) => void (await page.goto("/orders/lookup")) },
];

for (const viewport of VIEWPORTS) {
	test.describe(`accessibility at ${viewport.name}`, () => {
		test.use({ viewport: viewport.size });

		for (const entry of PAGES) {
			test(`${entry.name} has no serious or critical violations`, async ({ page }) => {
				await entry.open(page);
				await expectNoBlockingViolations(page, entry.exclude);
			});
		}

		test.fixme(`shop: a sold-out card meets colour contrast (known issue)`, async ({ page }) => {
			test.info().annotations.push({ type: "known issue", description: KNOWN_ISSUES.soldOutCard.reason });
			await page.goto("/shop");
			await expectNoBlockingViolations(page);
		});

		test.fixme(`cart: a line that is not ready for checkout meets colour contrast (known issue)`, async ({ page }) => {
			test.info().annotations.push({ type: "known issue", description: KNOWN_ISSUES.unavailableCartLine.reason });
			await openProduct(page, CATALOG.simpleProduct.slug);
			await addToCartFromProductPage(page);
			await page.goto("/cart");
			await expectNoBlockingViolations(page);
		});
	});
}
