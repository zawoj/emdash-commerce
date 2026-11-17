import { type Locator, type Page } from "@playwright/test";

/** The value (`<dd>`) of a term (`<dt>`) on the order page, e.g. "Order number", "Payment", "Total". */
export const orderValue = (page: Page, term: string): Locator =>
	page.getByRole("main").locator("dt", { hasText: new RegExp(`^${term}$`) }).locator("xpath=following-sibling::dd[1]");
