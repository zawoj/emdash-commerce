import { describe, expect, it } from "vitest";

import { ORDER_PAYMENT_STATUS, FULFILLMENT_STATUS, type Order } from "../../core/order.js";
import { toCurrencyCode } from "../../core/money.js";
import { commerceEventId, type AnyCommerceEvent } from "../../core/events.js";
import { createHarness } from "../payments/test-support.js";
import { createEventPublisher } from "../outbox.js";
import { createEmailSubscriber, EMAIL_SUBSCRIBER_ID } from "../subscribers/emails.js";
import { builtInSubscribers } from "../subscribers/index.js";
import { defaultEmailRenderers } from "./defaults.js";
import { escapeHtml, formatAmount } from "./html.js";
import { renderEmail } from "./render.js";
import { buildViewUrl } from "./view-url.js";

const NASTY = `<img src=x onerror="alert('x')"> & "Co"`;

const order = (over: Partial<Order> = {}): Order => ({
	id: "ord_1",
	orderNumber: "ORD-2026-AAAAAA",
	orderStatus: "open",
	paymentStatus: ORDER_PAYMENT_STATUS.paid,
	statusBeforeDispute: null,
	fulfillmentStatus: FULFILLMENT_STATUS.unfulfilled,
	mode: "payment",
	customerId: null,
	email: "buyer@example.com",
	customerName: "Ada",
	phone: null,
	billingAddress: null,
	shippingAddress: null,
	lines: [{ priceId: "p", productId: "pr", variantId: null, title: "Mug", variantTitle: "Blue", sku: null, optionsText: null, quantity: 2, unitAmount: 1900, amountSubtotal: 3800, discountAmount: 0, taxAmount: 0, amountTotal: 3800, priceType: "one_time", stripePriceId: "price_1" }],
	totals: { subtotal: 3800, discount: 0, tax: 0, shipping: 0, total: 3800, refunded: 0, currency: toCurrencyCode("pln") },
	reviewFlags: [],
	cartId: null,
	subscriptionId: null,
	stripe: { checkoutSessionId: "cs_1", paymentIntentId: "pi_1", customerId: "cus_1", subscriptionId: null, invoiceId: null, isLivemode: false },
	placedAt: "2026-01-15T12:00:00.000Z",
	paidAt: "2026-01-15T12:00:00.000Z",
	...over,
});

const paidEvent = (orderId = "ord_1"): AnyCommerceEvent => ({ id: commerceEventId("order.paid", orderId), type: "order.paid", occurredAt: "2026-01-15T12:00:00.000Z", data: { orderId, orderNumber: "ORD-2026-AAAAAA", amount: 3800, currency: "pln" } });
const failedEvent = (orderId = "ord_1"): AnyCommerceEvent => ({ id: commerceEventId("order.payment_failed", orderId), type: "order.payment_failed", occurredAt: "2026-01-15T12:00:00.000Z", data: { orderId, orderNumber: "ORD-2026-AAAAAA", failureCode: null } });
const refundEvent = (orderId = "ord_1"): AnyCommerceEvent => ({
	id: commerceEventId("order.refunded", "rf_1"),
	type: "order.refunded",
	occurredAt: "2026-01-15T12:00:00.000Z",
	data: { orderId, orderNumber: "ORD-2026-AAAAAA", refundId: "rf_1", amount: 1900, amountRefundedTotal: 1900, isFullyRefunded: false },
});

describe("default email templates", () => {
	it("render plain text and accessible HTML for every email", () => {
		const input = { order: order(), viewUrl: "https://shop.example/orders/view?token=abc", storeName: "Shop" };
		const confirmation = defaultEmailRenderers.orderConfirmation(input);
		expect(confirmation.subject).toBe("Shop: order ORD-2026-AAAAAA confirmed");
		expect(confirmation.text).toContain("38.00 PLN");
		expect(confirmation.text).toContain("https://shop.example/orders/view?token=abc");
		expect(confirmation.html).toContain('<html lang="en">');
		expect(confirmation.html).toContain('<th scope="col"');
		expect(confirmation.html).toContain('href="https://shop.example/orders/view?token=abc"');
		expect(defaultEmailRenderers.paymentFailed({ order: order(), storeName: "Shop" }).text).toContain("could not process the payment");
		expect(defaultEmailRenderers.refundIssued({ order: order(), amount: 1900, storeName: "Shop" }).text).toContain("refunded 19.00 PLN");
		expect(defaultEmailRenderers.orderAccessLink({ orderNumber: "N1", viewUrl: "https://x.test/v", storeName: "Shop" }).html).toContain("https://x.test/v");
	});

	it("lists a derived variant title without repeating the product title", () => {
		const derived = order({ lines: [{ ...order().lines[0]!, title: "Mug", variantTitle: "Mug — Blue / M" }] });
		const { text } = defaultEmailRenderers.orderConfirmation({ order: derived, viewUrl: "https://x.test/v", storeName: "Shop" });
		expect(text).toContain("Mug (Blue / M)");
		expect(text).not.toContain("Mug — Blue");
	});

	it("escapes every interpolated value in the HTML (names, titles, store name, URLs) and keeps headers single-line", () => {
		const hostile = order({ customerName: NASTY, lines: [{ ...order().lines[0]!, title: NASTY, variantTitle: NASTY }] });
		const message = defaultEmailRenderers.orderConfirmation({ order: hostile, viewUrl: `https://x.test/?q="><script>1</script>`, storeName: NASTY });
		expect(message.html).not.toContain("<img");
		expect(message.html).not.toContain("<script>");
		expect(message.html).not.toMatch(/onerror="/);
		expect(message.html).toContain("&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt; &amp; &quot;Co&quot;");
		const withBreak = defaultEmailRenderers.orderConfirmation({ order: order(), viewUrl: "https://x.test", storeName: "Shop\r\nBcc: evil@example.com" });
		expect(withBreak.subject).not.toMatch(/[\r\n]/);
		expect(escapeHtml(`<&>"'`)).toBe("&lt;&amp;&gt;&quot;&#39;");
	});

	it("formats amounts by currency decimals", () => {
		expect(formatAmount(1999, "pln")).toBe("19.99 PLN");
		expect(formatAmount(500, "jpy")).toBe("500 JPY");
		expect(formatAmount(1234, "kwd")).toBe("1.234 KWD");
	});
});

describe("renderEmail (site overrides)", () => {
	const input = { order: order(), storeName: "Shop" };

	it("uses a site renderer when given", () => {
		const h = createHarness({ extensions: { emails: { paymentFailed: () => ({ subject: "custom", text: "t", html: null }) } } });
		expect(renderEmail(h.container, "paymentFailed", input)).toEqual({ subject: "custom", text: "t", html: null });
	});

	it("falls back to the built-in template, and logs, when the renderer throws or returns garbage", () => {
		const errors: string[] = [];
		const throwing = createHarness({ extensions: { emails: { paymentFailed: () => { throw new Error("template bug"); } } } });
		throwing.container.log.error = (message) => void errors.push(message);
		expect(renderEmail(throwing.container, "paymentFailed", input).subject).toBe("Shop: payment for order ORD-2026-AAAAAA failed");
		expect(errors).toEqual(["Email renderer failed; using the built-in template"]);

		const garbage = createHarness({ extensions: { emails: { paymentFailed: (() => ({ subject: 5 })) as never } } });
		garbage.container.log.error = (message) => void errors.push(message);
		expect(renderEmail(garbage.container, "paymentFailed", input).subject).toContain("failed");
		expect(errors).toHaveLength(2);
	});
});

describe("view URL", () => {
	it("replaces {TOKEN} in a site path or an absolute https path", () => {
		const h = createHarness({ options: { emails: { orderViewPath: "/o/{TOKEN}" } } });
		expect(buildViewUrl(h.container, "a.b")).toBe("https://shop.example/o/a.b");
		const absolute = createHarness({ options: { emails: { orderViewPath: "https://orders.example/v?t={TOKEN}" } } });
		expect(buildViewUrl(absolute.container, "a.b")).toBe("https://orders.example/v?t=a.b");
	});
});

describe("email subscriber", () => {
	const setup = async (options: Parameters<typeof createHarness>[0] = {}) => {
		const h = createHarness(options);
		const stored = await h.container.orders.create({ ...order(), id: undefined } as never);
		const sent: Array<{ to: string; subject: string; text: string; html: string | null }> = [];
		h.container.mailer = { send: async (message) => (sent.push(message), true) };
		return { h, sent, order: stored, subscriber: createEmailSubscriber(h.container) };
	};

	it("is registered in the built-in registry under a stable id for the three order events", () => {
		const h = createHarness();
		const [subscriber] = builtInSubscribers(h.container);
		expect(subscriber!.id).toBe(EMAIL_SUBSCRIBER_ID);
		expect([...subscriber!.events].sort()).toEqual(["order.paid", "order.payment_failed", "order.refunded"]);
	});

	it("order.paid sends the confirmation with a signed view link that opens the order", async () => {
		const { h, sent, order: stored, subscriber } = await setup();
		await subscriber.handle(paidEvent(stored.id) as never, {} as never);
		expect(sent).toHaveLength(1);
		expect(sent[0]).toMatchObject({ to: "buyer@example.com", subject: expect.stringContaining("confirmed") });
		const token = new URL(/https:\/\/\S+/.exec(sent[0]!.text)![0]).searchParams.get("token")!;
		const { requireAccessToken, ACCESS_SCOPE } = await import("../access-tokens.js");
		expect(await requireAccessToken(h.container, token, ACCESS_SCOPE.orderView)).toMatchObject({ orderId: stored.id });
	});

	it("order.payment_failed and order.refunded send their emails", async () => {
		const { sent, order: stored, subscriber } = await setup();
		await subscriber.handle(failedEvent(stored.id) as never, {} as never);
		await subscriber.handle(refundEvent(stored.id) as never, {} as never);
		expect(sent.map((message) => message.subject)).toEqual([expect.stringContaining("failed"), expect.stringContaining("refund")]);
		expect(sent[1]!.text).toContain("19.00 PLN");
	});

	it("uses the site's renderer override end to end", async () => {
		const { sent, order: stored, subscriber } = await setup({ extensions: { emails: { orderConfirmation: ({ order: o, viewUrl }) => ({ subject: `Hello ${o.orderNumber}`, text: viewUrl, html: null }) } } });
		await subscriber.handle(paidEvent(stored.id) as never, {} as never);
		expect(sent[0]).toMatchObject({ subject: "Hello ORD-2026-AAAAAA", html: null });
	});

	it("emails.isEnabled=false disables the subscriber", async () => {
		const { sent, order: stored, subscriber } = await setup({ options: { emails: { isEnabled: false } } });
		await subscriber.handle(paidEvent(stored.id) as never, {} as never);
		expect(sent).toHaveLength(0);
	});

	it("with no email provider the delivery is logged and counts as done (the event is not retried forever)", async () => {
		const h = createHarness();
		const stored = await h.container.orders.create({ ...order(), id: undefined } as never);
		const warnings: string[] = [];
		h.container.log.warn = (message) => void warnings.push(message);
		h.container.mailer = { send: async () => false };
		const publisher = createEventPublisher(h.container);
		await publisher.publish([paidEvent(stored.id)]);
		const record = (await h.container.outbox.get(paidEvent(stored.id).id))!.value;
		expect(record.deliveries[EMAIL_SUBSCRIBER_ID]).toMatchObject({ status: "delivered", attempts: 1 });
		expect(warnings).toContain("Email not sent: no email provider accepted it");
	});

	it("a missing order is skipped without failing the delivery", async () => {
		const { sent, subscriber } = await setup();
		await expect(subscriber.handle(paidEvent("ghost") as never, {} as never)).resolves.toBeUndefined();
		expect(sent).toHaveLength(0);
	});

	it("without an access token secret the confirmation still goes out, linking the site root", async () => {
		const { h, sent, order: stored, subscriber } = await setup();
		h.setSecrets({ accessTokenSecret: null });
		await subscriber.handle(paidEvent(stored.id) as never, {} as never);
		expect(sent).toHaveLength(1);
		expect(sent[0]!.text).toContain("https://shop.example/");
	});
});
