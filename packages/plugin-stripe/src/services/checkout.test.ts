import { beforeEach, describe, expect, it } from "vitest";

import { checkoutStatusView, checkoutView } from "../contracts/api.js";
import { ORDER_PAYMENT_STATUS, type Order } from "../core/order.js";
import { isCommerceError } from "../core/errors.js";
import { toCurrencyCode } from "../core/money.js";
import { ProviderError, type CheckoutSessionInput } from "../ports/payment-provider.js";
import { RECORD_INDEX_KEY } from "../ports/repositories.js";
import { createCartService, type CartService } from "./cart.js";
import { createStorefrontWorld, price, product, recurringPrice, type StorefrontWorld } from "./cart/test-support.js";
import { createCheckoutService, type CheckoutService } from "./checkout.js";
import { sanitizeCustomization } from "./checkout/customization.js";
import { maskEmail } from "./checkout/status.js";
import { resolveRedirectUrl } from "./checkout/urls.js";

const CONTEXT = { userAgent: "vitest", country: "PL" };
const LAMP = { kind: "product", id: "p2" } as const;
const pln = toCurrencyCode("pln");

const failure = async (promise: Promise<unknown>) => {
	try {
		await promise;
	} catch (error) {
		if (isCommerceError(error)) return error;
		throw error;
	}
	throw new Error("expected a CommerceError");
};

describe("checkout service", () => {
	let w: StorefrontWorld;
	let cart: CartService;
	let checkout: CheckoutService;

	const setup = (input: Parameters<typeof createStorefrontWorld>[0] = {}) => {
		w = createStorefrontWorld(input);
		w.seedBasic();
		w.world.catalog.addProduct(product({ id: "p2", slug: "lamp", inventory: { isTracked: true, allowsBackorder: false } }));
		w.world.catalog.addPrice(price({ id: "pr2", productId: "p2", unitAmount: 2500, isDefault: false }));
		w.world.catalog.addProduct(product({ id: "p4", slug: "plan" }));
		w.world.catalog.addPrice(recurringPrice());
		w.world.catalog.addPrice(recurringPrice({ id: "prsub2", unitAmount: 900, recurring: { interval: "month", intervalCount: 1, trialDays: 30 }, isDefault: false }));
		cart = createCartService(w.container, w.deps);
		checkout = createCheckoutService(w.container, w.deps, { pollMs: 1, maxPolls: 200 });
	};

	const cartWith = async (...lines: Array<[string, number]>): Promise<string> => {
		let id: string | null = null;
		for (const [priceId, quantity] of lines) id = (await cart.setLine(id, { priceId, quantity, mode: "add" }, CONTEXT)).cartId;
		return id as string;
	};
	const stockLamps = (units: number) => w.world.inventory.adjust(LAMP, units, "seed");
	const sessionInputs = (): CheckoutSessionInput[] => w.provider.callsOf("createSession").map((call) => call.args as CheckoutSessionInput);
	const heldReservations = async (cartId: string) => {
		const stored = (await w.world.carts.get(cartId))?.value.checkout?.reservationId;
		return stored ? await w.world.inventory.getReservation(stored) : null;
	};

	beforeEach(() => setup());

	describe("creating a session", () => {
		it("hosted payment: prices from the server, reserves stock, stores the snapshot and opens the cart", async () => {
			await stockLamps(5);
			const cartId = await cartWith(["pr1", 2], ["pr2", 1]);
			const view = await checkout.checkout(cartId, { uiMode: "hosted", email: " Buyer@Example.com " });
			expect(checkoutView.parse(view)).toEqual(view);
			expect(view).toMatchObject({ uiMode: "hosted", clientSecret: null, url: expect.stringContaining("https://checkout.stripe.test/") });
			expect(new Date(view.expiresAt).toISOString()).toBe("2026-01-15T12:30:00.000Z");

			const [input] = sessionInputs();
			expect(input).toMatchObject({
				mode: "payment",
				uiMode: "hosted",
				currency: "pln",
				customerEmail: "buyer@example.com",
				providerCustomerId: null,
				successUrl: "https://shop.test/checkout/success?session_id={CHECKOUT_SESSION_ID}",
				cancelUrl: "https://shop.test/cart",
				returnUrl: null,
				trialDays: null,
				lines: [{ providerPriceId: "price_pr1", quantity: 2 }, { providerPriceId: "price_pr2", quantity: 1 }],
			});
			expect(w.provider.callsOf("createSession")[0]?.idempotencyKey).toBe(`stripe-commerce:checkout:${input?.checkoutId}`);
			// The adapter decides payment methods from the Dashboard: the service never sends them.
			expect(Object.keys(input as object)).not.toContain("payment_method_types");
			expect(JSON.stringify(w.provider.calls)).not.toContain("payment_method_types");

			const snapshot = await w.world.snapshots.getBySession(view.sessionId);
			expect(snapshot).toMatchObject({
				cartId,
				mode: "payment",
				currency: "pln",
				expectedSubtotal: 4500,
				customerId: null,
				lines: [
					{ priceId: "pr1", providerPriceId: "price_pr1", quantity: 2, unitAmount: 1000 },
					{ priceId: "pr2", providerPriceId: "price_pr2", quantity: 1, unitAmount: 2500 },
				],
			});
			expect(snapshot?.reservationId).toBe(input?.checkoutId);
			const stored = (await w.world.carts.get(cartId))!.value;
			expect(stored).toMatchObject({ status: "checkout_open", email: "buyer@example.com", checkout: { sessionId: view.sessionId, reservationId: input?.checkoutId } });
			expect(await heldReservations(cartId)).toMatchObject({ status: "held", lines: [{ sellable: { kind: "product", id: "p1" }, quantity: 2 }, { sellable: LAMP, quantity: 1 }] });
			expect(await w.world.inventory.get(LAMP)).toMatchObject({ available: 4, reserved: 1 });
			expect(w.world.cartMirror.mirrored.get(cartId)?.cart.status).toBe("checkout_open");
		});

		it("embedded: only the return URL, a client secret and no url", async () => {
			const cartId = await cartWith(["pr1", 1]);
			const view = await checkout.checkout(cartId, { uiMode: "embedded" });
			expect(checkoutView.parse(view)).toEqual(view);
			expect(view).toMatchObject({ uiMode: "embedded", url: null, clientSecret: expect.stringContaining("_secret_") });
			expect(sessionInputs()[0]).toMatchObject({
				uiMode: "embedded",
				successUrl: null,
				cancelUrl: null,
				returnUrl: "https://shop.test/checkout/return?session_id={CHECKOUT_SESSION_ID}",
			});
		});

		it("subscription mode carries the longest trial of the recurring lines; payment mode never does", async () => {
			const cartId = await cartWith(["pr1", 1], ["prsub", 1], ["prsub2", 1]);
			const view = await checkout.checkout(cartId, { uiMode: "hosted" });
			expect(sessionInputs()[0]).toMatchObject({ mode: "subscription", trialDays: 30 });
			expect((await w.world.snapshots.getBySession(view.sessionId))?.mode).toBe("subscription");
		});

		it("a lone subscription uses its own trial", async () => {
			await checkout.checkout(await cartWith(["prsub", 1]), { uiMode: "hosted" });
			expect(sessionInputs()[0]).toMatchObject({ mode: "subscription", trialDays: 14 });
		});

		it("uses the known provider customer of this email (never creating one here)", async () => {
			const customer = await w.world.customers.create({
				email: "buyer@example.com", name: null, phone: null, billingAddress: null, shippingAddress: null, stripeCustomerId: "cus_known", orderCount: 1, totalSpent: {}, firstOrderAt: null, lastOrderAt: null,
			});
			await w.world.recordIndex.set(RECORD_INDEX_KEY.customerByEmail("buyer@example.com"), customer.id);
			const cartId = await cartWith(["pr1", 1]);
			const view = await checkout.checkout(cartId, { uiMode: "hosted", email: "BUYER@example.com" });
			expect(sessionInputs()[0]).toMatchObject({ providerCustomerId: "cus_known", customerEmail: "buyer@example.com" });
			expect((await w.world.snapshots.getBySession(view.sessionId))?.customerId).toBe(customer.id);
			expect(w.provider.callsOf("createCustomer")).toHaveLength(0);
		});

		it("does not enable a UI mode the options turned off", async () => {
			setup({ options: { checkout: { uiModes: ["hosted"] } } });
			const cartId = await cartWith(["pr1", 1]);
			expect(await failure(checkout.checkout(cartId, { uiMode: "embedded" }))).toMatchObject({ code: "INVALID_INPUT", status: 400 });
			expect(w.provider.callsOf("createSession")).toHaveLength(0);
		});
	});

	describe("refusing a cart that cannot be checked out", () => {
		it("404 for no cart, an unknown cart and a converted cart", async () => {
			expect((await failure(checkout.checkout(null, { uiMode: "hosted" }))).status).toBe(404);
			expect((await failure(checkout.checkout("Z".repeat(32), { uiMode: "hosted" }))).status).toBe(404);
			const cartId = await cartWith(["pr1", 1]);
			const stored = (await w.world.carts.get(cartId))!;
			await w.world.carts.put({ ...stored.value, status: "converted" }, stored.revision);
			expect((await failure(checkout.checkout(cartId, { uiMode: "hosted" }))).status).toBe(404);
		});

		it("409 with the issues for an empty cart, a stock problem and a price that cannot be synced; nothing is reserved or created", async () => {
			const emptied = await cartWith(["pr1", 1]);
			await cart.removeLine(emptied, "pr1", CONTEXT);
			expect(await failure(checkout.checkout(emptied, { uiMode: "hosted" }))).toMatchObject({ code: "CART_NOT_CHECKOUT_READY", status: 409, details: { issues: [] } });

			await stockLamps(1);
			const lamps = await cartWith(["pr2", 2]);
			const stock = await failure(checkout.checkout(lamps, { uiMode: "hosted" }));
			expect(stock).toMatchObject({ code: "CART_NOT_CHECKOUT_READY", details: { issues: [{ code: "INSUFFICIENT_STOCK", priceId: "pr2", available: 1 }] } });

			w.catalogSync.unsellable.add("pr1");
			const unsynced = await failure(checkout.checkout(await cartWith(["pr1", 1]), { uiMode: "hosted" }));
			expect(unsynced).toMatchObject({ status: 409, details: { issues: [{ code: "NOT_SYNCED", priceId: "pr1" }] } });
			expect(w.provider.callsOf("createSession")).toHaveLength(0);
			expect(await w.world.inventory.get(LAMP)).toMatchObject({ reserved: 0 });
		});

		it("applies the site's validateCart rule at checkout too", async () => {
			setup({ extensions: { validateCart: async () => [{ code: "CUSTOM", priceId: null, message: "Closed today" }] } });
			const cartId = await cartWith(["pr1", 1]);
			expect(await failure(checkout.checkout(cartId, { uiMode: "hosted" }))).toMatchObject({ details: { issues: [{ code: "CUSTOM", message: "Closed today" }] } });
		});
	});

	describe("stock", () => {
		it("a shortfall that appears after pricing is 409 INSUFFICIENT_STOCK, creates no session and reopens the cart", async () => {
			await stockLamps(3);
			const cartId = await cartWith(["pr2", 2]);
			// Another buyer takes the units between the cart view and the checkout.
			const original = w.container.inventory.reserve;
			w.container.inventory.reserve = async (request) => {
				await w.world.inventory.adjust(LAMP, -2, "sold elsewhere");
				return original(request);
			};
			const error = await failure(checkout.checkout(cartId, { uiMode: "hosted" }));
			expect(error).toMatchObject({
				code: "INSUFFICIENT_STOCK",
				status: 409,
				details: { shortfalls: [{ kind: "product", id: "p2", requested: 2, available: 1 }], issues: [{ code: "INSUFFICIENT_STOCK", priceId: "pr2", available: 1 }] },
			});
			expect(w.provider.callsOf("createSession")).toHaveLength(0);
			expect(await w.world.inventory.get(LAMP)).toMatchObject({ reserved: 0, available: 1 });
			expect((await w.world.carts.get(cartId))?.value).toMatchObject({ status: "active", checkout: null });
		});

		it("guards tracked stock but not a backorderable product (the guard flag comes from the catalog)", async () => {
			w.world.catalog.addProduct(product({ id: "p5", slug: "bo", inventory: { isTracked: true, allowsBackorder: true } }));
			w.world.catalog.addPrice(price({ id: "pr5", productId: "p5", isDefault: false }));
			await w.world.inventory.adjust({ kind: "product", id: "p5" }, 1, "seed");
			const view = await checkout.checkout(await cartWith(["pr5", 3]), { uiMode: "hosted" });
			expect(view.sessionId).toBeTruthy();
			expect(await w.world.inventory.get({ kind: "product", id: "p5" })).toMatchObject({ available: -2, reserved: 3 });
		});
	});

	describe("compensation", () => {
		it("a provider failure after reserving releases the reservation, expires nothing it never created and reopens the cart", async () => {
			await stockLamps(5);
			const cartId = await cartWith(["pr2", 2]);
			w.provider.failNext("createSession", new ProviderError("Stripe is down", { isRetryable: true }));
			await expect(checkout.checkout(cartId, { uiMode: "hosted" })).rejects.toBeInstanceOf(ProviderError);
			expect(await w.world.inventory.get(LAMP)).toMatchObject({ available: 5, reserved: 0 });
			expect((await w.world.carts.get(cartId))?.value).toMatchObject({ status: "active", checkout: null });
			expect(w.provider.sessions.size).toBe(0);
			// And the buyer can simply try again.
			const retry = await checkout.checkout(cartId, { uiMode: "hosted" });
			expect(retry.sessionId).toBeTruthy();
			expect(await w.world.inventory.get(LAMP)).toMatchObject({ available: 3, reserved: 2 });
		});

		it("a failure while storing the opened cart also expires the session it created", async () => {
			await stockLamps(5);
			const cartId = await cartWith(["pr2", 1]);
			const original = w.container.snapshots.put;
			let writes = 0;
			w.container.snapshots.put = async (snapshot) => {
				writes += 1;
				if (writes === 2) throw new Error("storage hiccup after the session exists");
				return original(snapshot);
			};
			await expect(checkout.checkout(cartId, { uiMode: "hosted" })).rejects.toThrow("storage hiccup");
			const [session] = [...w.provider.sessions.values()];
			expect(session?.session.status).toBe("expired");
			expect(await w.world.inventory.get(LAMP)).toMatchObject({ available: 5, reserved: 0 });
		});

		it("a line changed while the session was being created: the stale session is expired, the hold released, and the new lines are checked out", async () => {
			await stockLamps(5);
			const cartId = await cartWith(["pr2", 1]);
			const originalCreate = w.provider.checkout.createSession.bind(w.provider.checkout);
			let isFirst = true;
			(w.provider.checkout as { createSession: typeof originalCreate }).createSession = async (input, key) => {
				const result = await originalCreate(input, key);
				if (isFirst) {
					isFirst = false;
					// The buyer edits the cart in another tab while Stripe was answering.
					const stored = (await w.world.carts.get(cartId))!;
					await w.world.carts.put({ ...stored.value, status: "active", checkout: null, lines: [{ priceId: "pr2", quantity: 2, addedAt: stored.value.createdAt }] }, stored.revision);
				}
				return result;
			};
			const view = await checkout.checkout(cartId, { uiMode: "hosted" });
			const sessions = [...w.provider.sessions.values()];
			expect(sessions).toHaveLength(2);
			expect(sessions[0]?.session.status).toBe("expired");
			expect(view.sessionId).toBe(sessions[1]?.session.sessionId);
			expect(await w.world.inventory.get(LAMP)).toMatchObject({ available: 3, reserved: 2 });
			expect(sessionInputs()[1]?.lines).toEqual([{ providerPriceId: "price_pr2", quantity: 2 }]);
		});
	});

	describe("double submit and concurrency", () => {
		it("a second request for the same open checkout returns the same session and creates nothing new", async () => {
			await stockLamps(5);
			const cartId = await cartWith(["pr2", 2]);
			const first = await checkout.checkout(cartId, { uiMode: "hosted" });
			const second = await checkout.checkout(cartId, { uiMode: "hosted", email: "other@example.com" });
			expect(second).toEqual(first);
			expect(w.provider.callsOf("createSession")).toHaveLength(1);
			expect(await w.world.inventory.get(LAMP)).toMatchObject({ available: 3, reserved: 2 });
		});

		it("does not reuse an open session whose lines no longer match the cart (a change that slipped past the unlock)", async () => {
			await stockLamps(5);
			const cartId = await cartWith(["pr2", 1]);
			const first = await checkout.checkout(cartId, { uiMode: "hosted" });
			const stored = (await w.world.carts.get(cartId))!;
			await w.world.carts.put({ ...stored.value, lines: [{ priceId: "pr2", quantity: 2, addedAt: stored.value.createdAt }] }, stored.revision);
			const second = await checkout.checkout(cartId, { uiMode: "hosted" });
			expect(second.sessionId).not.toBe(first.sessionId);
			expect(w.provider.sessions.get(first.sessionId)?.session.status).toBe("expired");
			expect(sessionInputs()[1]?.lines).toEqual([{ providerPriceId: "price_pr2", quantity: 2 }]);
		});

		it("returns the same embedded session with its client secret", async () => {
			const cartId = await cartWith(["pr1", 1]);
			const first = await checkout.checkout(cartId, { uiMode: "embedded" });
			expect(await checkout.checkout(cartId, { uiMode: "embedded" })).toEqual(first);
			expect(w.provider.callsOf("createSession")).toHaveLength(1);
		});

		it("another UI mode replaces the open session: the old one is expired and its hold released", async () => {
			await stockLamps(5);
			const cartId = await cartWith(["pr2", 1]);
			const hosted = await checkout.checkout(cartId, { uiMode: "hosted" });
			const embedded = await checkout.checkout(cartId, { uiMode: "embedded" });
			expect(embedded.sessionId).not.toBe(hosted.sessionId);
			expect(w.provider.sessions.get(hosted.sessionId)?.session.status).toBe("expired");
			expect(await w.world.inventory.get(LAMP)).toMatchObject({ available: 4, reserved: 1 });
		});

		it("an expired session is not reused: a new one is created", async () => {
			await stockLamps(5);
			const cartId = await cartWith(["pr2", 1]);
			const first = await checkout.checkout(cartId, { uiMode: "hosted" });
			w.world.clock.advance(31 * 60_000);
			const again = await checkout.checkout(cartId, { uiMode: "hosted" });
			expect(again.sessionId).not.toBe(first.sessionId);
			expect(await w.world.inventory.get(LAMP)).toMatchObject({ available: 4, reserved: 1 });
		});

		it("concurrent checkouts produce one session and one reservation, and everyone gets that session", async () => {
			await stockLamps(1);
			const cartId = await cartWith(["pr2", 1]);
			const views = await Promise.all(Array.from({ length: 5 }, () => checkout.checkout(cartId, { uiMode: "hosted" })));
			expect(new Set(views.map((view) => view.sessionId)).size).toBe(1);
			expect(w.provider.callsOf("createSession")).toHaveLength(1);
			expect(w.provider.sessions.size).toBe(1);
			// With one unit in stock, a loser must not have failed on stock: only the winner reserved.
			expect(await w.world.inventory.get(LAMP)).toMatchObject({ available: 0, reserved: 1 });
			expect([...w.provider.sessions.values()][0]?.session.status).toBe("open");
		});

		it("takes over a claim left behind by a request that died", async () => {
			await stockLamps(5);
			const cartId = await cartWith(["pr2", 1]);
			const stored = (await w.world.carts.get(cartId))!;
			await w.world.carts.put({ ...stored.value, status: "checkout_open", checkout: { sessionId: "", reservationId: "dead", expiresAt: "2026-01-15T12:30:00.000Z" } }, stored.revision);
			w.world.clock.advance(2 * 60_000);
			const view = await checkout.checkout(cartId, { uiMode: "hosted" });
			expect(view.sessionId).toBeTruthy();
			expect((await w.world.carts.get(cartId))?.value.checkout?.sessionId).toBe(view.sessionId);
		});

		it("a cart edit while the session is being created wins: the checkout re-reads and uses the new lines", async () => {
			await stockLamps(5);
			const cartId = await cartWith(["pr2", 1]);
			const original = w.container.inventory.reserve;
			let isFirst = true;
			w.container.inventory.reserve = async (request) => {
				if (isFirst) {
					isFirst = false;
					await cart.setLine(cartId, { priceId: "pr2", quantity: 3, mode: "set" }, CONTEXT);
				}
				return original(request);
			};
			const view = await checkout.checkout(cartId, { uiMode: "hosted" });
			expect(sessionInputs().at(-1)?.lines).toEqual([{ providerPriceId: "price_pr2", quantity: 3 }]);
			expect((await w.world.carts.get(cartId))?.value.checkout?.sessionId).toBe(view.sessionId);
			expect(await w.world.inventory.get(LAMP)).toMatchObject({ available: 2, reserved: 3 });
		});
	});

	describe("redirect URLs", () => {
		it("rejects a configured success URL on a foreign origin, creates no session and releases the hold", async () => {
			setup({ options: { checkout: { successPath: "https://evil.example/ok?session_id={CHECKOUT_SESSION_ID}" } } });
			await stockLamps(5);
			const cartId = await cartWith(["pr2", 1]);
			expect(await failure(checkout.checkout(cartId, { uiMode: "hosted" }))).toMatchObject({ code: "NOT_CONFIGURED", status: 503 });
			expect(w.provider.callsOf("createSession")).toHaveLength(0);
			expect(await w.world.inventory.get(LAMP)).toMatchObject({ available: 5, reserved: 0 });
		});

		it("accepts an extra allowed origin", async () => {
			setup({ options: { checkout: { successPath: "https://pay.example/ok?session_id={CHECKOUT_SESSION_ID}", allowedRedirectOrigins: ["https://pay.example"] } } });
			await checkout.checkout(await cartWith(["pr1", 1]), { uiMode: "hosted" });
			expect(sessionInputs()[0]?.successUrl).toBe("https://pay.example/ok?session_id={CHECKOUT_SESSION_ID}");
		});

		it("resolves paths against the site and keeps the placeholder literal, rejecting every host trick", () => {
			const allowed = ["https://pay.example"];
			expect(resolveRedirectUrl("/done?session_id={CHECKOUT_SESSION_ID}&x=1", "https://shop.test/base", allowed)).toBe("https://shop.test/done?session_id={CHECKOUT_SESSION_ID}&x=1");
			expect(resolveRedirectUrl("https://pay.example/a", "https://shop.test", allowed)).toBe("https://pay.example/a");
			for (const bad of ["//evil.example/x", "/\\evil.example/x", "https://evil.example", "https://shop.test.evil.example/", "https://pay.example:8443/", "javascript:alert(1)", "http://pay.example/"]) {
				expect(() => resolveRedirectUrl(bad, "https://shop.test", allowed), bad).toThrow(/allowed origins/);
			}
		});
	});

	describe("customizeCheckout extension", () => {
		it("applies the customisation and passes only its fields on", async () => {
			setup({
				options: { checkout: { shippingRates: [{ displayName: "Courier", amount: 1500, currency: "pln" }, { displayName: "Euro post", amount: 900, currency: "eur" }] } },
				extensions: {
					customizeCheckout: async (defaults, input) => {
						expect(defaults.shippingRates.map((rate) => rate.displayName)).toEqual(["Courier"]);
						expect(input.cart.lines).toHaveLength(1);
						return {
							...defaults,
							allowPromotionCodes: true,
							collectPhone: true,
							locale: "pl",
							shippingAddressCountries: ["pl", "de"],
							metadata: { campaign: "spring" },
							// A site cannot reach past the customisation: none of these may arrive at the provider.
							successUrl: "https://evil.example",
							lines: [],
							amount: 1,
						} as never;
					},
				},
			});
			await checkout.checkout(await cartWith(["pr1", 1]), { uiMode: "hosted" });
			const input = sessionInputs()[0]!;
			expect(input).toMatchObject({
				allowPromotionCodes: true,
				collectPhone: true,
				locale: "pl",
				shippingAddressCountries: ["PL", "DE"],
				extraMetadata: { campaign: "spring" },
				shippingRates: [{ displayName: "Courier", amount: 1500, currency: "pln" }],
				successUrl: "https://shop.test/checkout/success?session_id={CHECKOUT_SESSION_ID}",
				lines: [{ providerPriceId: "price_pr1", quantity: 1 }],
			});
			expect(JSON.stringify(input)).not.toContain("evil.example");
			expect(Object.keys(input)).not.toContain("amount");
		});

		it("sanitizeCustomization copies exactly the customisation fields, uppercases countries and bounds metadata", () => {
			const priced = { currency: pln } as never;
			const defaults = { allowPromotionCodes: false, shippingRates: [], shippingAddressCountries: [], collectPhone: false, locale: null, trialDays: null, metadata: {} };
			const clean = sanitizeCustomization({ ...defaults, shippingAddressCountries: ["pl"], extra: "x", successUrl: "https://evil.example" } as never, priced);
			expect(Object.keys(clean).sort()).toEqual(["allowPromotionCodes", "collectPhone", "locale", "metadata", "shippingAddressCountries", "shippingRates", "trialDays"]);
			expect(clean.shippingAddressCountries).toEqual(["PL"]);
			const tooMany = Object.fromEntries(Array.from({ length: 21 }, (_, index) => [`k${index}`, "v"]));
			expect(() => sanitizeCustomization({ ...defaults, metadata: tooMany }, priced)).toThrow(/metadata/);
			expect(() => sanitizeCustomization({ ...defaults, metadata: { k: "x".repeat(501) } }, priced)).toThrow(/metadata/);
			expect(() => sanitizeCustomization({ ...defaults, shippingAddressCountries: ["POL"] }, priced)).toThrow(/shippingAddressCountries/);
		});

		it("a malformed customisation is a generic failure that releases the hold", async () => {
			setup({ extensions: { customizeCheckout: async (defaults) => ({ ...defaults, metadata: { k: 42 as never } }) } });
			await stockLamps(5);
			const cartId = await cartWith(["pr2", 1]);
			await expect(checkout.checkout(cartId, { uiMode: "hosted" })).rejects.toThrow(/invalid metadata/);
			expect(w.provider.callsOf("createSession")).toHaveLength(0);
			expect(await w.world.inventory.get(LAMP)).toMatchObject({ reserved: 0 });
		});

		it("rejects a shipping rate in another currency and an out-of-range trial", async () => {
			setup({ extensions: { customizeCheckout: async (defaults) => ({ ...defaults, shippingRates: [{ displayName: "X", amount: 1, currency: toCurrencyCode("eur"), deliveryEstimateDays: null }] }) } });
			await expect(checkout.checkout(await cartWith(["pr1", 1]), { uiMode: "hosted" })).rejects.toThrow(/shippingRates/);
			setup({ extensions: { customizeCheckout: async (defaults) => ({ ...defaults, trialDays: 100_000 }) } });
			await expect(checkout.checkout(await cartWith(["pr1", 1]), { uiMode: "hosted" })).rejects.toThrow(/trialDays/);
		});
	});

	describe("status", () => {
		const orderFor = (sessionId: string, email = "jane@example.com"): Omit<Order, "id"> => ({
			orderNumber: "ORD-2026-ABCDEF", orderStatus: "open", paymentStatus: ORDER_PAYMENT_STATUS.paid, statusBeforeDispute: null, fulfillmentStatus: "unfulfilled", mode: "payment", customerId: null,
			email, customerName: "Jane Secret", phone: "+48 600 700 800",
			billingAddress: { line1: "Secret St 1", line2: null, city: "Warsaw", postalCode: "00-001", state: null, country: "PL" }, shippingAddress: null, lines: [],
			totals: { subtotal: 1000, discount: 0, tax: 0, shipping: 0, total: 1000, refunded: 0, currency: pln }, reviewFlags: [], cartId: null, subscriptionId: null,
			stripe: { checkoutSessionId: sessionId, paymentIntentId: "pi_1", customerId: "cus_1", subscriptionId: null, invoiceId: null, isLivemode: false }, placedAt: "2026-01-15T12:00:00.000Z", paidAt: null,
		});

		it("an open session has no order yet and no email", async () => {
			const view = await checkout.checkout(await cartWith(["pr1", 1]), { uiMode: "embedded" });
			const status = await checkout.status(view.sessionId);
			expect(checkoutStatusView.parse(status)).toEqual(status);
			expect(status).toEqual({ status: "open", paymentStatus: "unpaid", orderNumber: null, orderStatus: null, maskedEmail: "b***@example.com" });
		});

		it("a paid session reports the order number once settlement created the order, and nothing personal beyond the masked email", async () => {
			const view = await checkout.checkout(await cartWith(["pr1", 1]), { uiMode: "embedded", email: "jane@example.com" });
			w.provider.completeSession(view.sessionId, { email: "jane@example.com", name: "Jane Secret", phone: "+48 600 700 800" });
			expect(await checkout.status(view.sessionId)).toMatchObject({ status: "complete", paymentStatus: "paid", orderNumber: null });
			const order = await w.world.orders.create(orderFor(view.sessionId));
			await w.world.recordIndex.set(RECORD_INDEX_KEY.orderBySession(view.sessionId), order.id);
			const status = await checkout.status(view.sessionId);
			expect(status).toEqual({ status: "complete", paymentStatus: "paid", orderNumber: "ORD-2026-ABCDEF", orderStatus: "paid", maskedEmail: "j***@example.com" });
			const body = JSON.stringify(status);
			for (const secret of ["Jane", "Secret", "jane@example.com", "+48", "Warsaw", "_secret_", "cus_1", "pi_1"]) expect(body).not.toContain(secret);
		});

		it("answers 404 for a session this plugin did not create, without asking the provider", async () => {
			expect((await failure(checkout.status("cs_foreign"))).status).toBe(404);
			expect(w.provider.callsOf("retrieveSession")).toHaveLength(0);
		});

		it("masks emails", () => {
			expect(maskEmail("jane@example.com")).toBe("j***@example.com");
			expect(maskEmail("a@b.co")).toBe("a***@b.co");
			expect(maskEmail("not-an-email")).toBe("***");
			expect(maskEmail("@x.com")).toBe("***");
		});
	});
});
