import { describe, expect, it } from "vitest";

import { ROUTE } from "../../contracts/api.js";
import { ACCESS_SCOPE, issueAccessToken, signAccessToken } from "../../services/access-tokens.js";
import { createOpsHarness, failure, TOKEN_SECRET, type OpsHarness } from "../ops-test-support.js";

interface Sent {
	to: string;
	subject: string;
	text: string;
	html?: string;
}

const withMailbox = (h: OpsHarness): Sent[] => {
	const sent: Sent[] = [];
	(h.base as { email: unknown }).email = { send: async (message: Sent) => void sent.push(message) };
	return sent;
};

const tokenFrom = (message: Sent): string => new URL(/https?:\/\/\S+/.exec(message.text)![0]).searchParams.get("token")!;
const accessLink = (h: OpsHarness, input: unknown, ip: string | null = "198.51.100.1") => h.call(ROUTE.ordersAccessLink, { method: "POST", input, ip, user: null });

describe("orders routes declarations", () => {
	it("are public, with the contract methods; the order view is never cached", () => {
		const h = createOpsHarness();
		expect(h.routes[ROUTE.ordersAccessLink]).toMatchObject({ public: true, methods: ["POST"] });
		expect(h.routes[ROUTE.ordersView]).toMatchObject({ public: true, methods: ["GET"], cacheControl: "no-store" });
		expect(h.routes[ROUTE.customerPortal]).toMatchObject({ public: true, methods: ["POST"] });
	});
});

describe("orders/access-link", () => {
	it("answers the same whether the order exists, the email matches, or neither", async () => {
		const h = createOpsHarness();
		const sent = withMailbox(h);
		const { orderNumber } = await h.seedPaidOrder({ email: "Buyer@Example.com" });
		sent.length = 0; // the order confirmation sent at settlement is not under test here
		const answers = [
			await accessLink(h, { email: "buyer@example.com", orderNumber }),
			await accessLink(h, { email: "other@example.com", orderNumber }),
			await accessLink(h, { email: "buyer@example.com", orderNumber: "ORD-0000-NOPE00" }),
			await accessLink(h, { email: "nobody@example.com", orderNumber: "ORD-0000-NOPE00" }),
		];
		for (const answer of answers) expect(answer).toEqual({ isAccepted: true });
		expect(new Set(answers.map((answer) => JSON.stringify(answer))).size).toBe(1);
		expect(sent).toHaveLength(1);
	});

	it("emails a signed link only on a match (case tolerant), to the order's own address", async () => {
		const h = createOpsHarness();
		const sent = withMailbox(h);
		const { orderNumber, orderId } = await h.seedPaidOrder({ email: "Buyer@Example.com" });
		sent.length = 0;
		await accessLink(h, { email: "BUYER@example.COM", orderNumber: orderNumber.toLowerCase() });
		expect(sent).toHaveLength(1);
		expect(sent[0]).toMatchObject({ to: "Buyer@Example.com", subject: expect.stringContaining(orderNumber) });
		expect(sent[0]!.text).toContain("https://shop.example/orders/view?token=");
		const view = (await h.call(ROUTE.ordersView, { method: "GET", input: { token: tokenFrom(sent[0]!) }, user: null })) as any;
		expect(view.orderNumber).toBe(orderNumber);
		expect(orderId).toBeTruthy();
	});

	it("answers identically when sending fails or no email provider exists", async () => {
		const h = createOpsHarness();
		const { orderNumber } = await h.seedPaidOrder({ email: "b@example.com" });
		(h.base as { email: unknown }).email = {
			send: async () => {
				throw new Error("smtp down");
			},
		};
		expect(await accessLink(h, { email: "b@example.com", orderNumber })).toEqual({ isAccepted: true });
		const bare = createOpsHarness({ withEmail: false });
		const seeded = await bare.seedPaidOrder({ email: "b@example.com" });
		expect(await accessLink(bare, { email: "b@example.com", orderNumber: seeded.orderNumber })).toEqual({ isAccepted: true });
	});

	it("answers identically when the link cannot be built (no token secret configured), and sends nothing", async () => {
		const h = createOpsHarness();
		const sent = withMailbox(h);
		const { orderNumber } = await h.seedPaidOrder({ email: "b@example.com" });
		sent.length = 0;
		await h.base.settings.delete("accessTokenSecret");
		expect(await accessLink(h, { email: "b@example.com", orderNumber })).toEqual({ isAccepted: true });
		expect(h.base.logs.some((line) => line.message === "Order access link failed")).toBe(true);
		expect(sent).toHaveLength(0);
	});

	it("is rate limited per IP, whatever the order or email", async () => {
		const h = createOpsHarness({ options: { rateLimits: { orderLookupPerHour: 3 } } });
		const sent = withMailbox(h);
		for (let index = 0; index < 3; index += 1) await accessLink(h, { email: `a${index}@example.com`, orderNumber: "ORD-X" }, "203.0.113.50");
		expect(await failure(accessLink(h, { email: "z@example.com", orderNumber: "ORD-X" }, "203.0.113.50"))).toMatchObject({ code: "RATE_LIMITED", status: 429 });
		// another IP is not affected
		expect(await accessLink(h, { email: "z@example.com", orderNumber: "ORD-X" }, "203.0.113.51")).toEqual({ isAccepted: true });
		expect(sent).toHaveLength(0);
	});

	it("is rate limited per email across IPs (an attacker cannot rotate IPs against one mailbox)", async () => {
		const h = createOpsHarness({ options: { rateLimits: { orderLookupPerHour: 2 } } });
		await accessLink(h, { email: "victim@example.com", orderNumber: "A" }, "203.0.113.1");
		await accessLink(h, { email: "VICTIM@example.com", orderNumber: "B" }, "203.0.113.2");
		expect(await failure(accessLink(h, { email: "victim@example.com", orderNumber: "C" }, "203.0.113.3"))).toMatchObject({ code: "RATE_LIMITED" });
		expect(await accessLink(h, { email: "someone-else@example.com", orderNumber: "C" }, "203.0.113.3")).toEqual({ isAccepted: true });
	});

	it("does not store the email address in a storage key", async () => {
		const h = createOpsHarness();
		await accessLink(h, { email: "private.person@example.com", orderNumber: "A" });
		const ids = (await h.base.fakeStorage.rate_limits!.query({ limit: 100 })).items.map((item) => item.id);
		expect(ids.length).toBeGreaterThan(0);
		for (const id of ids) expect(id).not.toContain("private");
	});

	it("rejects malformed input", async () => {
		const h = createOpsHarness();
		expect(await failure(accessLink(h, { email: "not-an-email", orderNumber: "A" }))).toMatchObject({ code: "INVALID_INPUT" });
		expect(await failure(accessLink(h, { email: "a@example.com" }))).toMatchObject({ code: "INVALID_INPUT" });
	});
});

describe("orders/view", () => {
	it("returns the order view for a valid token and nothing internal", async () => {
		const h = createOpsHarness();
		const { orderId, orderNumber } = await h.seedPaidOrder({ email: "v@example.com", unitAmount: 1900, quantity: 2 });
		const token = await issueAccessToken(h.container(), orderId);
		const view = (await h.call(ROUTE.ordersView, { method: "GET", input: { token }, user: null })) as any;
		expect(view).toMatchObject({ orderNumber, status: "paid", email: "v@example.com", totals: { total: 3800, currency: "pln" }, hasSubscription: false, canOpenPortal: true });
		expect(view.lines).toHaveLength(1);
		expect(JSON.stringify(view)).not.toMatch(/stripe|sessionId|paymentIntent|reviewFlags/i);
	});

	it.each([
		["a garbage token", "x".repeat(40)],
		["a token with a flipped signature", ""],
	])("401 for %s, with one generic message", async (_name, forged) => {
		const h = createOpsHarness();
		const { orderId } = await h.seedPaidOrder();
		const good = await issueAccessToken(h.container(), orderId);
		const token = forged || `${good.slice(0, -2)}${good.endsWith("AA") ? "BB" : "AA"}`;
		const error = await failure(h.call(ROUTE.ordersView, { method: "GET", input: { token }, user: null }));
		expect(error).toMatchObject({ code: "UNAUTHORIZED", status: 401, message: "This link is invalid or has expired." });
	});

	it("401 for an expired token and for a token of a deleted order", async () => {
		const h = createOpsHarness({ options: { orders: { accessTokenDays: 1 } } });
		const { orderId } = await h.seedPaidOrder();
		const old = await signAccessToken({ secret: TOKEN_SECRET, orderId, now: new Date(Date.now() - 3 * 24 * 3600 * 1000), ttlDays: 1 });
		expect(await failure(h.call(ROUTE.ordersView, { method: "GET", input: { token: old }, user: null }))).toMatchObject({ status: 401 });
		const ghost = await signAccessToken({ secret: TOKEN_SECRET, orderId: "gone", now: new Date(), ttlDays: 1 });
		expect(await failure(h.call(ROUTE.ordersView, { method: "GET", input: { token: ghost }, user: null }))).toMatchObject({ status: 401 });
		const fresh = await signAccessToken({ secret: TOKEN_SECRET, orderId, now: new Date(), ttlDays: 1 });
		expect(await h.call(ROUTE.ordersView, { method: "GET", input: { token: fresh }, user: null })).toMatchObject({ status: "paid" });
	});

	it("a portal-only token cannot view the order, and a view-only token cannot open the portal", async () => {
		const h = createOpsHarness();
		const { orderId } = await h.seedPaidOrder();
		const container = h.container();
		const portalOnly = await issueAccessToken(container, orderId, [ACCESS_SCOPE.portal]);
		const viewOnly = await issueAccessToken(container, orderId, [ACCESS_SCOPE.orderView]);
		expect(await failure(h.call(ROUTE.ordersView, { method: "GET", input: { token: portalOnly }, user: null }))).toMatchObject({ status: 401 });
		expect(await failure(h.call(ROUTE.customerPortal, { input: { token: viewOnly }, user: null }))).toMatchObject({ status: 401 });
		expect(h.provider.callsOf("createPortalSession")).toHaveLength(0);
		expect(await h.call(ROUTE.ordersView, { method: "GET", input: { token: viewOnly }, user: null })).toMatchObject({ status: "paid" });
	});
});

describe("customer/portal", () => {
	it("opens the Stripe portal for the order's customer with the configured return URL", async () => {
		const h = createOpsHarness({ options: { orders: { portalReturnPath: "/account" } } });
		const { orderId } = await h.seedPaidOrder();
		const token = await issueAccessToken(h.container(), orderId);
		const result = (await h.call(ROUTE.customerPortal, { input: { token }, user: null })) as { url: string };
		expect(result.url).toMatch(/^https:\/\/billing\.stripe\.test\/session\/cus_/);
		expect(h.provider.callsOf("createPortalSession")[0]!.args).toMatchObject({ returnUrl: "https://shop.example/account" });
	});

	it("409 when the order has no Stripe customer", async () => {
		const h = createOpsHarness();
		const { orderId } = await h.seedPaidOrder();
		const container = h.container();
		const order = (await container.orders.get(orderId))!;
		await container.orders.update(orderId, { stripe: { ...order.stripe, customerId: null } });
		const token = await issueAccessToken(container, orderId);
		expect(await failure(h.call(ROUTE.customerPortal, { input: { token }, user: null }))).toMatchObject({ code: "CONFLICT", status: 409 });
		expect(h.provider.callsOf("createPortalSession")).toHaveLength(0);
	});

	it("401 on a bad token and rejects short tokens at the boundary", async () => {
		const h = createOpsHarness();
		expect(await failure(h.call(ROUTE.customerPortal, { input: { token: "y".repeat(40) }, user: null }))).toMatchObject({ status: 401 });
		expect(await failure(h.call(ROUTE.customerPortal, { input: { token: "short" }, user: null }))).toMatchObject({ code: "INVALID_INPUT" });
	});
});
