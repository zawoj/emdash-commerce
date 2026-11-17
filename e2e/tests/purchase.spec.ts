import { expect, test, type APIRequestContext } from "@playwright/test";

import { CATALOG, ORDER_NUMBER_SHAPE } from "../support/catalog";
import { addToCartFromProductPage, openProduct } from "../support/cart";
import { payOnHostedCheckout } from "../support/checkout-page";
import { orderValue } from "../support/order-page";
import { listDevEmails, orderLinkOf, signInToDevServer, waitForEmail } from "../support/dev-emails";
import { PLUGIN_API } from "../support/config";
import { isStripeReady, stripeSkipReason } from "../support/stripe-env";

const { simpleProduct } = CATALOG;
const MUTATION_HEADERS = { "X-EmDash-Request": "1" };
/** Unique per run: the Stripe sandbox and the dev mailbox both accumulate. */
const buyer = { email: `e2e-buyer-${Date.now()}@example.com`, name: "Ada Buyer" };

interface PlacedOrder {
	orderNumber: string;
	orderLink: string;
}

/** Flips one character of the token's signature so it can no longer verify. */
const tampered = (orderLink: string): string => {
	const flipped = orderLink.endsWith("A") ? "B" : "A";
	return `${orderLink.slice(0, -1)}${flipped}`;
};

const requestAccessLink = (request: APIRequestContext, email: string, orderNumber: string) =>
	request.post(`${PLUGIN_API}/orders/access-link`, { headers: MUTATION_HEADERS, data: { email, orderNumber } });

test.describe("purchase", () => {
	test.skip(!isStripeReady(), `Stripe suite skipped: ${stripeSkipReason()}`);
	// The second test reads the order the first one placed.
	test.describe.configure({ mode: "serial" });

	let order: PlacedOrder | undefined;

	test("buys a product through hosted Stripe Checkout and opens the order from the emailed link", async ({ page, request }) => {
		await openProduct(page, simpleProduct.slug);
		await addToCartFromProductPage(page);

		await page.goto("/cart");
		await expect(page.getByRole("main").getByTestId("cart-checkout")).toBeEnabled();
		await page.getByRole("main").getByTestId("cart-checkout").click();
		await payOnHostedCheckout(page, buyer);

		// The success page waits for the webhook: "Paid" and the order number only show once the order exists.
		await expect(page.getByTestId("checkout-status")).toContainText("Paid", { timeout: 60_000 });
		await expect(page.getByTestId("checkout-order-number")).toHaveText(ORDER_NUMBER_SHAPE);
		const orderNumber = (await page.getByTestId("checkout-order-number").innerText()).trim();

		// EmDash keeps the emails a dev server sends in memory; reading them needs the dev login.
		await signInToDevServer(request);
		const confirmation = await waitForEmail(request, buyer.email, (email) => email.subject.includes(orderNumber));
		expect(confirmation.text).toContain(simpleProduct.title);
		const orderLink = orderLinkOf(confirmation);
		expect(orderLink, "the confirmation email carries an order link").toBeDefined();
		if (!orderLink) return;
		order = { orderNumber, orderLink };

		const view = await page.goto(orderLink);
		expect(view?.status()).toBe(200);
		expect(view?.headers()["cache-control"]).toContain("no-store");
		expect(view?.headers()["referrer-policy"]).toBe("no-referrer");
		await expect(page.getByRole("heading", { level: 1, name: "Your order" })).toBeVisible();
		await expect(orderValue(page, "Order number")).toHaveText(orderNumber);
		await expect(orderValue(page, "Payment")).toHaveText("Paid");
		await expect(page.getByRole("list", { name: "Items in your order" })).toContainText(simpleProduct.title);
		await expect(page.getByRole("list", { name: "Items in your order" })).toContainText(simpleProduct.price);
		await expect(orderValue(page, "Total")).toHaveText(simpleProduct.price);

		// One changed character and the signature no longer verifies: the same 404 page as any bad link.
		const forged = await page.goto(tampered(orderLink));
		expect(forged?.status()).toBe(404);
		await expect(page.getByRole("heading", { level: 1, name: "This link has expired or is not valid" })).toBeVisible();
		await expect(page.getByRole("link", { name: "Request a new order link" })).toHaveAttribute("href", "/orders/lookup");
	});

	test("the lookup page emails a new link for a real order and answers the same for a fake one", async ({ page, request }) => {
		expect(order, "the purchase test places the order first").toBeDefined();
		if (!order) return;
		await signInToDevServer(request);

		// What the API answers must not tell the two apart (the plugin route, called directly).
		const real = await requestAccessLink(request, buyer.email, order.orderNumber);
		const fakeNumber = "ORD-1999-99999";
		const fake = await requestAccessLink(request, buyer.email, fakeNumber);
		expect(real.status()).toBe(200);
		expect({ status: fake.status(), body: await fake.text() }).toEqual({ status: real.status(), body: await real.text() });

		// The page: same notice for both, but only the real order produces an email.
		await page.goto("/orders/lookup");
		await page.getByTestId("order-lookup-email").fill(buyer.email);
		await page.getByTestId("order-lookup-number").fill(order.orderNumber);
		await page.getByTestId("order-lookup-submit").click();
		const realNotice = (await page.getByTestId("order-lookup-notice").innerText()).trim();

		await page.goto("/orders/lookup");
		await page.getByTestId("order-lookup-email").fill(buyer.email);
		await page.getByTestId("order-lookup-number").fill(fakeNumber);
		await page.getByTestId("order-lookup-submit").click();
		await expect(page.getByTestId("order-lookup-notice")).toBeVisible();
		expect((await page.getByTestId("order-lookup-notice").innerText()).trim()).toBe(realNotice);

		const accessEmail = await waitForEmail(request, buyer.email, (email) => email.subject.includes(order?.orderNumber ?? "") && email.subject.includes("your link"));
		const link = orderLinkOf(accessEmail);
		expect(link, "the access-link email carries an order link").toBeDefined();
		await page.goto(link ?? "/");
		await expect(orderValue(page, "Order number")).toHaveText(order.orderNumber);

		const mails = await listDevEmails(request);
		expect(mails.filter((email) => email.subject.includes(fakeNumber))).toEqual([]);
	});
});
