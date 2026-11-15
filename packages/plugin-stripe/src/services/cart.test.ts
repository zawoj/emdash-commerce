import { beforeEach, describe, expect, it } from "vitest";

import { cartView } from "../contracts/api.js";
import { CART_ISSUE, CART_STATUS, type Cart } from "../core/cart.js";
import { isCommerceError } from "../core/errors.js";
import { createCartService, type CartService } from "./cart.js";
import { createStorefrontWorld, price, product, recurringPrice, variant, type StorefrontWorld } from "./cart/test-support.js";

const CONTEXT = { userAgent: "vitest", country: "PL" };

const failure = async (promise: Promise<unknown>) => {
	try {
		await promise;
	} catch (error) {
		if (isCommerceError(error)) return error;
		throw error;
	}
	throw new Error("expected a CommerceError");
};

describe("cart service", () => {
	let w: StorefrontWorld;
	let cart: CartService;

	const setup = (input: Parameters<typeof createStorefrontWorld>[0] = {}) => {
		w = createStorefrontWorld(input);
		w.seedBasic();
		cart = createCartService(w.container, w.deps);
	};

	beforeEach(() => setup());

	it("starts a fresh unsaved cart for no id, an unknown id and an expired id, persisting nothing", async () => {
		const first = await cart.get(null, CONTEXT);
		expect(first).toMatchObject({ isNew: true, status: "active", lines: [], itemCount: 0, subtotal: null, isCheckoutReady: false });
		expect(first.cartId).toMatch(/^[A-Za-z0-9_-]{32}$/);
		const unknown = await cart.get("U".repeat(32), CONTEXT);
		expect(unknown.isNew).toBe(true);
		expect(unknown.cartId).not.toBe("U".repeat(32));
		expect(await w.world.carts.get(first.cartId)).toBeNull();
		expect(w.world.cartMirror.mirrored.size).toBe(0);

		const added = await cart.setLine(null, { priceId: "pr1", quantity: 1, mode: "add" }, CONTEXT);
		w.world.clock.advance(31 * 24 * 60 * 60 * 1000);
		const expired = await cart.get(added.cartId, CONTEXT);
		expect(expired.isNew).toBe(true);
		expect(expired.cartId).not.toBe(added.cartId);
	});

	it("creates the cart on the first line, prices it on the server and returns a contract-valid view", async () => {
		const view = await cart.setLine(null, { priceId: "pr1", quantity: 2, mode: "add" }, CONTEXT);
		expect(cartView.parse(view)).toEqual(view);
		expect(view).toMatchObject({
			isNew: true,
			itemCount: 2,
			subtotal: { amount: 2000, currency: "pln" },
			mode: "payment",
			isCheckoutReady: true,
			lines: [{ priceId: "pr1", quantity: 2, lineTotal: { amount: 2000, currency: "pln" } }],
		});
		const stored = await w.world.carts.get(view.cartId);
		expect(stored?.value).toMatchObject({ status: "active", context: CONTEXT, email: null });
		// Never the IP, only what the context holds.
		expect(JSON.stringify(stored?.value)).not.toContain("203.0.113");

		const next = await cart.get(view.cartId, CONTEXT);
		expect(next.isNew).toBe(false);
		expect(next.itemCount).toBe(2);
	});

	it("adds, sets and removes lines; add increments, set replaces, set 0 and remove delete", async () => {
		w.world.catalog.addPrice(price({ id: "pr1b", unitAmount: 500, isDefault: false }));
		let view = await cart.setLine(null, { priceId: "pr1", quantity: 1, mode: "add" }, CONTEXT);
		const id = view.cartId;
		view = await cart.setLine(id, { priceId: "pr1", quantity: 2, mode: "add" }, CONTEXT);
		expect(view.lines[0]?.quantity).toBe(3);
		view = await cart.setLine(id, { priceId: "pr1", quantity: 5, mode: "set" }, CONTEXT);
		expect(view.lines[0]?.quantity).toBe(5);
		view = await cart.setLine(id, { priceId: "pr1b", quantity: 1, mode: "add" }, CONTEXT);
		expect(view.lines.map((line) => line.priceId)).toEqual(["pr1", "pr1b"]);
		expect(view.isNew).toBe(false);
		view = await cart.setLine(id, { priceId: "pr1", quantity: 0, mode: "set" }, CONTEXT);
		expect(view.lines.map((line) => line.priceId)).toEqual(["pr1b"]);
		view = await cart.removeLine(id, "pr1b", CONTEXT);
		expect(view.lines).toEqual([]);
		// Removing a line that is not there is a no-op, not an error.
		view = await cart.removeLine(id, "pr1b", CONTEXT);
		expect(view.itemCount).toBe(0);
	});

	it("enforces the line and quantity limits from the options", async () => {
		setup({ options: { cart: { maxLines: 2, maxQuantityPerLine: 3 } } });
		w.world.catalog.addPrice(price({ id: "b", isDefault: false }));
		w.world.catalog.addPrice(price({ id: "c", isDefault: false }));
		const first = await cart.setLine(null, { priceId: "pr1", quantity: 3, mode: "add" }, CONTEXT);
		const over = await failure(cart.setLine(first.cartId, { priceId: "pr1", quantity: 1, mode: "add" }, CONTEXT));
		expect(over).toMatchObject({ code: "INVALID_INPUT", status: 400, details: { maxQuantityPerLine: 3 } });
		const tooMany = await failure(cart.setLine(null, { priceId: "pr1", quantity: 4, mode: "set" }, CONTEXT));
		expect(tooMany.status).toBe(400);
		await cart.setLine(first.cartId, { priceId: "b", quantity: 1, mode: "add" }, CONTEXT);
		const lines = await failure(cart.setLine(first.cartId, { priceId: "c", quantity: 1, mode: "add" }, CONTEXT));
		expect(lines).toMatchObject({ status: 400, details: { maxLines: 2 } });
		// The rejected change stored nothing.
		expect((await w.world.carts.get(first.cartId))?.value.lines.map((line) => line.priceId)).toEqual(["pr1", "b"]);
	});

	it("only accepts a price that exists and is sellable (404 missing, 409 inactive, unpublished or inactive variant)", async () => {
		w.world.catalog.addPrice(price({ id: "off", isActive: false, isDefault: false }));
		w.world.catalog.addProduct(product({ id: "hidden", slug: "hidden", isPublished: false }));
		w.world.catalog.addPrice(price({ id: "hid", productId: "hidden", isDefault: false }));
		w.world.catalog.addProduct(product({ id: "p3", slug: "tee", hasVariants: true }));
		w.world.catalog.addVariant(variant({ id: "v-off", isActive: false }));
		w.world.catalog.addPrice(price({ id: "pv", productId: "p3", variantId: "v-off", isDefault: false }));
		w.world.catalog.addPrice(price({ id: "orphan", productId: "p3", variantId: "gone", isDefault: false }));

		expect(await failure(cart.setLine(null, { priceId: "nope", quantity: 1, mode: "add" }, CONTEXT))).toMatchObject({ code: "NOT_FOUND", status: 404 });
		expect(await failure(cart.setLine(null, { priceId: "off", quantity: 1, mode: "add" }, CONTEXT))).toMatchObject({ code: "CONFLICT", status: 409 });
		expect((await failure(cart.setLine(null, { priceId: "hid", quantity: 1, mode: "add" }, CONTEXT))).status).toBe(409);
		expect((await failure(cart.setLine(null, { priceId: "pv", quantity: 1, mode: "add" }, CONTEXT))).status).toBe(409);
		expect((await failure(cart.setLine(null, { priceId: "orphan", quantity: 1, mode: "add" }, CONTEXT))).status).toBe(404);
	});

	it("surfaces pricing issues without refusing the line: out of stock, mixed currency, a failed sync", async () => {
		w.world.catalog.addProduct(product({ id: "p2", slug: "lamp", inventory: { isTracked: true, allowsBackorder: false } }));
		w.world.catalog.addPrice(price({ id: "pr2", productId: "p2", isDefault: false }));
		await w.world.inventory.adjust({ kind: "product", id: "p2" }, 1, "seed");
		const view = await cart.setLine(null, { priceId: "pr2", quantity: 3, mode: "add" }, CONTEXT);
		expect(view.isCheckoutReady).toBe(false);
		expect(view.issues).toEqual([expect.objectContaining({ code: CART_ISSUE.insufficientStock, priceId: "pr2", available: 1 })]);

		w.world.catalog.addPrice(price({ id: "eur", unitAmount: 100, currency: "eur" as never, isDefault: false }));
		// Not in supportedCurrencies: cannot be added at all.
		expect((await failure(cart.setLine(view.cartId, { priceId: "eur", quantity: 1, mode: "add" }, CONTEXT))).status).toBe(409);

		await w.world.catalogLinks.put(
			{ entityKey: "price:pr1", providerId: null, providerPriceByFingerprint: {}, fingerprint: null, syncStatus: "failed", lastError: "boom", attempts: 3, nextAttemptAt: null, syncedAt: null, driftFields: [] },
			null,
		);
		const failed = await cart.setLine(view.cartId, { priceId: "pr1", quantity: 1, mode: "add" }, CONTEXT);
		expect(failed.issues.map((issue) => issue.code)).toContain(CART_ISSUE.notSynced);
	});

	it("adds the issues of the site's validateCart extension and blocks checkout readiness", async () => {
		setup({
			extensions: {
				validateCart: async (priced) => (priced.subtotal && priced.subtotal.amount < 5000 ? [{ code: CART_ISSUE.custom, priceId: null, message: "Minimum order is 50 PLN" }] : []),
			},
		});
		const small = await cart.setLine(null, { priceId: "pr1", quantity: 1, mode: "add" }, CONTEXT);
		expect(small.issues).toEqual([{ code: "CUSTOM", priceId: null, message: "Minimum order is 50 PLN" }]);
		expect(small.isCheckoutReady).toBe(false);
		const big = await cart.setLine(small.cartId, { priceId: "pr1", quantity: 5, mode: "set" }, CONTEXT);
		expect(big.issues).toEqual([]);
		expect(big.isCheckoutReady).toBe(true);
	});

	it("keeps both changes when two tabs add at once (compare-and-set retry)", async () => {
		w.world.catalog.addPrice(price({ id: "pr1b", isDefault: false }));
		const base = await cart.setLine(null, { priceId: "pr1", quantity: 1, mode: "add" }, CONTEXT);
		await Promise.all([
			cart.setLine(base.cartId, { priceId: "pr1b", quantity: 1, mode: "add" }, CONTEXT),
			cart.setLine(base.cartId, { priceId: "pr1", quantity: 2, mode: "add" }, CONTEXT),
			cart.setLine(base.cartId, { priceId: "pr1b", quantity: 4, mode: "add" }, CONTEXT),
		]);
		const lines = (await w.world.carts.get(base.cartId))?.value.lines ?? [];
		expect(Object.fromEntries(lines.map((line) => [line.priceId, line.quantity]))).toEqual({ pr1: 3, pr1b: 5 });
	});

	it("gives a converted cart's id a new cart and never modifies the converted one", async () => {
		const view = await cart.setLine(null, { priceId: "pr1", quantity: 1, mode: "add" }, CONTEXT);
		const stored = (await w.world.carts.get(view.cartId))!;
		await w.world.carts.put({ ...stored.value, status: CART_STATUS.converted, orderId: "o1" }, stored.revision);
		const before = (await w.world.carts.get(view.cartId))!;

		const got = await cart.get(view.cartId, CONTEXT);
		expect(got).toMatchObject({ isNew: true, lines: [], status: "active" });
		expect(got.cartId).not.toBe(view.cartId);
		const added = await cart.setLine(view.cartId, { priceId: "pr1", quantity: 7, mode: "add" }, CONTEXT);
		expect(added.cartId).not.toBe(view.cartId);
		expect(added.itemCount).toBe(7);
		expect(await w.world.carts.get(view.cartId)).toEqual(before);
		expect((await cart.removeLine(view.cartId, "pr1", CONTEXT)).isNew).toBe(true);
		expect(await w.world.carts.get(view.cartId)).toEqual(before);
	});

	describe("a cart with an open checkout", () => {
		const openCheckout = async () => {
			w.world.catalog.addProduct(product({ id: "p2", slug: "lamp", inventory: { isTracked: true, allowsBackorder: false } }));
			w.world.catalog.addPrice(price({ id: "pr2", productId: "p2", isDefault: false }));
			await w.world.inventory.adjust({ kind: "product", id: "p2" }, 5, "seed");
			const view = await cart.setLine(null, { priceId: "pr2", quantity: 2, mode: "add" }, CONTEXT);
			const session = await w.provider.checkout.createSession(
				{ checkoutId: "c1", cartId: view.cartId, mode: "payment", uiMode: "hosted", currency: "pln" as never, lines: [{ providerPriceId: "price_pr2", quantity: 2 }], customerEmail: null, providerCustomerId: null, successUrl: "https://shop.test/ok", cancelUrl: "https://shop.test/no", returnUrl: null, expiresAt: "2026-01-15T12:30:00.000Z", locale: null, allowPromotionCodes: false, billingAddressCollection: "auto", shippingAddressCountries: [], shippingRates: [], collectPhone: false, automaticTax: false, trialDays: null, extraMetadata: {} },
				"k1",
			);
			const reserved = await w.world.inventory.reserve({ reservationId: "res1", cartId: view.cartId, lines: [{ sellable: { kind: "product", id: "p2" }, quantity: 2, isGuarded: true }], expiresAt: "2026-01-15T12:30:00.000Z" });
			expect(reserved.ok).toBe(true);
			const stored = (await w.world.carts.get(view.cartId))!;
			await w.world.carts.put({ ...stored.value, status: CART_STATUS.checkoutOpen, checkout: { sessionId: session.sessionId, reservationId: "res1", expiresAt: "2026-01-15T12:30:00.000Z" } }, stored.revision);
			return { cartId: view.cartId, sessionId: session.sessionId };
		};

		it("shows the cart against its own reservation, so it does not compete with itself for stock", async () => {
			const { cartId } = await openCheckout();
			const view = await cart.get(cartId, CONTEXT);
			expect(view.status).toBe("checkout_open");
			expect(view.issues).toEqual([]);
			expect(view.lines[0]?.available).toBe(5);
		});

		it("expires the Stripe session, releases the reservation and reopens the cart when a line changes", async () => {
			const { cartId, sessionId } = await openCheckout();
			const view = await cart.setLine(cartId, { priceId: "pr2", quantity: 3, mode: "set" }, CONTEXT);
			expect(view).toMatchObject({ status: "active", itemCount: 3 });
			expect(w.provider.sessions.get(sessionId)?.session.status).toBe("expired");
			expect(await w.world.inventory.getReservation("res1")).toMatchObject({ status: "released" });
			expect(await w.world.inventory.get({ kind: "product", id: "p2" })).toMatchObject({ reserved: 0, available: 5 });
			expect((await w.world.carts.get(cartId))?.value.checkout).toBeNull();
		});

		it("does the same for a removal", async () => {
			const { cartId, sessionId } = await openCheckout();
			const view = await cart.removeLine(cartId, "pr2", CONTEXT);
			expect(view).toMatchObject({ status: "active", itemCount: 0 });
			expect(w.provider.sessions.get(sessionId)?.session.status).toBe("expired");
			expect(await w.world.inventory.getReservation("res1")).toMatchObject({ status: "released" });
		});

		it("refuses to change a cart whose session is already paid, and touches nothing", async () => {
			const { cartId, sessionId } = await openCheckout();
			w.provider.completeSession(sessionId);
			expect(await failure(cart.setLine(cartId, { priceId: "pr2", quantity: 1, mode: "set" }, CONTEXT))).toMatchObject({ code: "CART_LOCKED", status: 409 });
			expect(await w.world.inventory.getReservation("res1")).toMatchObject({ status: "held" });
			expect((await w.world.carts.get(cartId))?.value.status).toBe("checkout_open");
		});

		it("leaves the cart untouched when the change is invalid (validated before the session is expired)", async () => {
			const { cartId, sessionId } = await openCheckout();
			await failure(cart.setLine(cartId, { priceId: "pr2", quantity: 1000, mode: "set" }, CONTEXT));
			expect(w.provider.sessions.get(sessionId)?.session.status).toBe("open");
			expect(await w.world.inventory.getReservation("res1")).toMatchObject({ status: "held" });
		});
	});

	it("mirrors each persisted change for the admin and never fails the request when the mirror does", async () => {
		const view = await cart.setLine(null, { priceId: "pr1", quantity: 2, mode: "add" }, CONTEXT);
		expect(w.world.cartMirror.mirrored.get(view.cartId)?.summary).toMatchObject({ itemCount: 2, subtotal: 2000, currency: "pln" });
		w.container.cartMirror.upsert = async () => {
			throw new Error("content write failed");
		};
		const next = await cart.setLine(view.cartId, { priceId: "pr1", quantity: 1, mode: "add" }, CONTEXT);
		expect(next.itemCount).toBe(3);
		expect(w.logs.some((entry) => entry.level === "warn" && entry.message === "Cart mirror failed")).toBe(true);
	});

	it("slides the expiry on every change and prices subscriptions", async () => {
		w.world.catalog.addProduct(product({ id: "p4", slug: "plan" }));
		w.world.catalog.addPrice(recurringPrice());
		const first = await cart.setLine(null, { priceId: "pr1", quantity: 1, mode: "add" }, CONTEXT);
		w.world.clock.advance(60_000);
		const second = await cart.setLine(first.cartId, { priceId: "prsub", quantity: 1, mode: "add" }, CONTEXT);
		expect(new Date(second.expiresAt).getTime()).toBeGreaterThan(new Date(first.expiresAt).getTime());
		expect(second.mode).toBe("subscription");
		expect(second.lines.find((line) => line.priceId === "prsub")).toMatchObject({ priceType: "recurring", interval: "month", trialDays: 14 });
	});

	it("reactivates an abandoned cart on change", async () => {
		const view = await cart.setLine(null, { priceId: "pr1", quantity: 1, mode: "add" }, CONTEXT);
		const stored = (await w.world.carts.get(view.cartId))!;
		await w.world.carts.put({ ...stored.value, status: CART_STATUS.abandoned } as Cart, stored.revision);
		const next = await cart.setLine(view.cartId, { priceId: "pr1", quantity: 1, mode: "add" }, CONTEXT);
		expect(next).toMatchObject({ status: "active", isNew: false, itemCount: 2 });
	});
});
