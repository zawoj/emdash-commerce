import { expect, test, type APIResponse } from "@playwright/test";

const LOOKUP_ENDPOINT = "/api/orders/access-link";
const NOTICE_TEXT = "If the email and order number belong together, we sent a link.";
const MUTATION_HEADERS = { "Content-Type": "application/json", Accept: "application/json", "X-EmDash-Request": "1" };

test.describe("order link page (/orders/view)", () => {
	test("a link with a bad token is a 404 page that points to the lookup", async ({ page }) => {
		const response = await page.goto("/orders/view?token=not-a-real-token");
		expect(response?.status()).toBe(404);
		await expect(page.getByRole("heading", { level: 1, name: "This link has expired or is not valid" })).toBeVisible();

		await page.getByRole("link", { name: "Request a new order link" }).click();
		await expect(page).toHaveURL(/\/orders\/lookup$/);
		await expect(page.getByTestId("order-lookup-submit")).toBeVisible();
	});

	for (const [label, url] of [
		["a bad token", "/orders/view?token=not-a-real-token"],
		["no token", "/orders/view"],
		["a token that is far too long", `/orders/view?token=${"a".repeat(4000)}`],
	] as const) {
		test(`${label} is a 404 that is never cached, never indexed and sends no referrer`, async ({ request, page }) => {
			const response = await request.get(url);
			expect(response.status()).toBe(404);
			expect(response.headers()["cache-control"]).toContain("no-store");
			expect(response.headers()["referrer-policy"]).toBe("no-referrer");

			await page.goto(url);
			await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
		});
	}
});

test.describe("order lookup (/orders/lookup)", () => {
	test("submitting shows the same generic notice and the form is usable again", async ({ page }) => {
		await page.goto("/orders/lookup");
		await expect(page.getByTestId("order-lookup-notice")).toBeHidden();

		await page.getByTestId("order-lookup-email").fill("someone-lookup@example.com");
		await page.getByTestId("order-lookup-number").fill("ORD-2026-00001");
		await page.getByTestId("order-lookup-submit").click();

		await expect(page.getByTestId("order-lookup-notice")).toBeVisible();
		await expect(page.getByTestId("order-lookup-notice")).toContainText(NOTICE_TEXT);
		await expect(page.getByTestId("order-lookup-submit")).toBeEnabled();
	});

	test("the notice is identical for a number that could exist and one that cannot", async ({ page }) => {
		const notices: string[] = [];
		for (const [email, number] of [
			["real-looking@example.com", "ORD-2026-00001"],
			["fake@example.com", "ORD-1999-99999"],
			["junk@example.com", "not an order number"],
		] as const) {
			await page.goto("/orders/lookup");
			await page.getByTestId("order-lookup-email").fill(email);
			await page.getByTestId("order-lookup-number").fill(number);
			await page.getByTestId("order-lookup-submit").click();
			await expect(page.getByTestId("order-lookup-notice")).toBeVisible();
			notices.push((await page.getByTestId("order-lookup-notice").innerText()).trim());
		}
		expect(new Set(notices).size).toBe(1);
		expect(notices[0]).toContain(NOTICE_TEXT);
	});

	test("the API gives one answer whether or not the order exists", async ({ request }) => {
		const ask = async (email: string, orderNumber: string): Promise<{ status: number; body: string }> => {
			const response: APIResponse = await request.post(LOOKUP_ENDPOINT, { headers: MUTATION_HEADERS, data: { email, orderNumber } });
			return { status: response.status(), body: await response.text() };
		};
		const realLooking = await ask("api-a@example.com", "ORD-2026-00001");
		const fake = await ask("api-b@example.com", "ORD-1999-99999");
		expect(realLooking.status).toBe(200);
		expect(fake).toEqual(realLooking);
	});

	test("without JavaScript the form still posts and ends on the notice", async ({ browser }) => {
		const context = await browser.newContext({ javaScriptEnabled: false });
		const page = await context.newPage();
		await page.goto("/orders/lookup");
		await page.getByTestId("order-lookup-email").fill("nojs@example.com");
		await page.getByTestId("order-lookup-number").fill("ORD-2026-00001");
		await page.getByTestId("order-lookup-submit").click();
		await expect(page).toHaveURL(/\/orders\/lookup\?sent=1$/);
		await expect(page.getByTestId("order-lookup-notice")).toContainText(NOTICE_TEXT);
		await context.close();
	});
});
