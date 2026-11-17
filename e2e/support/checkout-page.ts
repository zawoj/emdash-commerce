import { expect, type Frame, type Locator, type Page } from "@playwright/test";

const FRAME_LOOKUP_TIMEOUT_MS = 30_000;

export interface Buyer {
	email: string;
	name: string;
}

/** Stripe's test card that always succeeds, with any future expiry and any CVC. */
const TEST_CARD = { number: "4242424242424242", expiry: "1234", cvc: "123" } as const;
const TEST_ADDRESS = { line1: "Test Street 1", postalCode: "00-001", city: "Warsaw" } as const;

/**
 * Stripe's hosted Checkout renders its fields in the page or in iframes, and which depends on the payment method
 * section. Look for the selector in every frame and return the first locator that matches.
 */
const findInFrames = async (page: Page, build: (frame: Frame) => Locator, description: string): Promise<Locator> => {
	let found: Locator | undefined;
	await expect
		.poll(
			async () => {
				for (const frame of page.frames()) {
					const candidate = build(frame).first();
					if ((await candidate.count().catch(() => 0)) > 0) {
						found = candidate;
						return true;
					}
				}
				return false;
			},
			{ message: `Stripe Checkout: ${description} not found in any frame`, timeout: FRAME_LOOKUP_TIMEOUT_MS },
		)
		.toBe(true);
	if (!found) throw new Error(`Stripe Checkout: ${description} not found`);
	return found;
};

const fillField = async (page: Page, name: string, value: string): Promise<void> => {
	const field = await findInFrames(page, (frame) => frame.locator(`input[name="${name}"]`), `input ${name}`);
	await field.fill(value);
};

/** The page may offer adaptive pricing (the buyer's currency). The shop prices in USD, so choose USD when the choice exists. */
const preferUsd = async (page: Page): Promise<void> => {
	for (const frame of page.frames()) {
		const radio = frame.locator("#currency-usd");
		if ((await radio.count().catch(() => 0)) === 0) continue;
		await frame.locator('label:has(#currency-usd), label[for="currency-usd"]').first().click();
		await expect(radio).toBeChecked();
		return;
	}
};

/** Pays the hosted Checkout page the browser is on with the test card and waits for the redirect back to the shop. */
export const payOnHostedCheckout = async (page: Page, buyer: Buyer): Promise<void> => {
	await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60_000 });
	await findInFrames(page, (frame) => frame.locator('input[name="email"], input[type="email"]'), "the email field");
	await preferUsd(page);

	await fillField(page, "email", buyer.email);
	const card = await findInFrames(page, (frame) => frame.getByRole("button", { name: /^Card/ }), "the Card payment method");
	await card.click();

	await fillField(page, "number", TEST_CARD.number);
	await fillField(page, "expiry", TEST_CARD.expiry);
	await fillField(page, "cvc", TEST_CARD.cvc);
	await fillField(page, "name", buyer.name);
	await fillField(page, "addressLine1", TEST_ADDRESS.line1);
	await fillField(page, "postalCode", TEST_ADDRESS.postalCode);
	await fillField(page, "locality", TEST_ADDRESS.city);

	const pay = await findInFrames(page, (frame) => frame.getByRole("button", { name: /^Pay$/ }), "the Pay button");
	await pay.click();
	await page.waitForURL(/\/checkout\/success/, { timeout: 90_000 });
};
