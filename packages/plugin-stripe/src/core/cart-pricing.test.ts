import { describe, expect, it } from "vitest";

import { CART_ISSUE, CART_STATUS, type Cart, type CartIssueCode } from "./cart.js";
import { BILLING_INTERVAL, PRICE_TYPE, TAX_BEHAVIOR, priceTermsFingerprint, sellableKey, type Price, type Product, type Variant } from "./catalog.js";
import { priceCart, type PriceCartInput } from "./cart-pricing.js";
import type { StockLevel } from "./inventory.js";
import { toCurrencyCode } from "./money.js";

const pln = toCurrencyCode("pln");
const eur = toCurrencyCode("eur");

const product = (over: Partial<Product> = {}): Product => ({
	id: "p1",
	slug: "mug",
	title: "Mug",
	description: null,
	imageUrls: [],
	isPublished: true,
	hasVariants: false,
	inventory: { isTracked: false, allowsBackorder: false },
	taxCode: null,
	price: null,
	sku: null,
	typeId: null,
	brandId: null,
	categoryIds: [],
	specs: {},
	...over,
});

const variant = (over: Partial<Variant> = {}): Variant => ({
	id: "v1",
	productId: "p1",
	title: "Blue / M",
	sku: "MUG-BM",
	optionValueIds: [],
	optionsKey: "",
	price: null,
	imageUrls: [],
	isActive: true,
	inventory: { isTracked: true, allowsBackorder: false },
	...over,
});

const price = (over: Partial<Price> = {}): Price => ({
	id: "pr1",
	productId: "p1",
	variantId: null,
	nickname: null,
	type: PRICE_TYPE.oneTime,
	unitAmount: 1000,
	currency: pln,
	recurring: null,
	taxBehavior: TAX_BEHAVIOR.unspecified,
	lookupKey: null,
	isActive: true,
	isDefault: true,
	isManaged: false,
	...over,
});

const level = (key: { kind: "product" | "variant"; id: string }, available: number, reserved = 0): StockLevel => ({
	sellable: key,
	onHand: available + reserved,
	reserved,
	available,
	mirroredOnHand: available + reserved,
	updatedAt: "2026-01-01T00:00:00.000Z",
});

const cartOf = (...lines: Array<[string, number]>): Cart => ({
	id: "c".repeat(32),
	status: CART_STATUS.active,
	lines: lines.map(([priceId, quantity]) => ({ priceId, quantity, addedAt: "2026-01-01T00:00:00.000Z" })),
	email: null,
	checkout: null,
	orderId: null,
	context: { userAgent: null, country: null },
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
	expiresAt: "2026-02-01T00:00:00.000Z",
});

const synced = (...prices: Price[]) =>
	new Map(prices.map((item) => [item.id, { providerPriceByFingerprint: { [priceTermsFingerprint(item)]: `stripe_${item.id}` } }]));

const build = (over: Partial<PriceCartInput> & { cart: Cart }): PriceCartInput => {
	const prices = over.prices ?? new Map([["pr1", price()]]);
	return {
		prices,
		products: new Map([["p1", product()]]),
		variants: new Map(),
		stock: new Map(),
		catalogLinks: synced(...prices.values()),
		options: { maxLines: 50, maxQuantityPerLine: 99, supportedCurrencies: ["pln", "eur"] },
		...over,
	};
};

const codes = (result: ReturnType<typeof priceCart>): CartIssueCode[] => result.issues.map((item) => item.code);

describe("priceCart", () => {
	it("prices a plain one-time cart server-side", () => {
		const result = priceCart(build({ cart: cartOf(["pr1", 3]) }));
		expect(result.isCheckoutReady).toBe(true);
		expect(result.mode).toBe("payment");
		expect(result.currency).toBe(pln);
		expect(result.subtotal).toEqual({ amount: 3000, currency: pln });
		expect(result.itemCount).toBe(3);
		expect(result.lines[0]).toMatchObject({ title: "Mug", quantity: 3, lineTotal: { amount: 3000 }, available: null });
	});

	it("an empty cart has no mode and is not checkout-ready", () => {
		const result = priceCart(build({ cart: cartOf() }));
		expect(result).toMatchObject({ mode: null, isCheckoutReady: false, subtotal: null, currency: null, itemCount: 0, issues: [] });
	});

	it("switches to subscription mode when any line recurs", () => {
		const monthly = price({ id: "pr2", type: PRICE_TYPE.recurring, recurring: { interval: BILLING_INTERVAL.month, intervalCount: 1, trialDays: 7 } });
		const prices = new Map([["pr1", price()], ["pr2", monthly]]);
		const result = priceCart(build({ cart: cartOf(["pr1", 1], ["pr2", 1]), prices }));
		expect(result.mode).toBe("subscription");
		expect(result.issues).toEqual([]);
		expect(result.lines[1]).toMatchObject({ interval: "month", intervalCount: 1, trialDays: 7 });
	});

	it("flags a missing price without dropping the other lines", () => {
		const result = priceCart(build({ cart: cartOf(["gone", 1], ["pr1", 1]) }));
		expect(codes(result)).toEqual([CART_ISSUE.priceNotFound]);
		expect(result.lines).toHaveLength(1);
		expect(result.isCheckoutReady).toBe(false);
	});

	it.each([
		["inactive price", { prices: new Map([["pr1", price({ isActive: false })]]) }, CART_ISSUE.priceInactive],
		["unsupported currency", { prices: new Map([["pr1", price({ currency: toCurrencyCode("usd") })]]) }, CART_ISSUE.priceInactive],
		["unpublished product", { products: new Map([["p1", product({ isPublished: false })]]) }, CART_ISSUE.productUnpublished],
		["missing product", { products: new Map() }, CART_ISSUE.productUnpublished],
	] as const)("%s blocks checkout", (_name, over, code) => {
		const result = priceCart(build({ cart: cartOf(["pr1", 1]), ...over }));
		expect(codes(result)).toContain(code);
		expect(result.isCheckoutReady).toBe(false);
	});

	it("flags an inactive or missing variant", () => {
		const onVariant = new Map([["pr1", price({ variantId: "v1" })]]);
		const inactive = priceCart(build({ cart: cartOf(["pr1", 1]), prices: onVariant, variants: new Map([["v1", variant({ isActive: false })]]) }));
		const missing = priceCart(build({ cart: cartOf(["pr1", 1]), prices: onVariant }));
		expect(codes(inactive)).toContain(CART_ISSUE.variantInactive);
		expect(codes(missing)).toContain(CART_ISSUE.variantInactive);
	});

	it("flags a price with no provider price for its current terms (not synced)", () => {
		const stale = new Map([["pr1", { providerPriceByFingerprint: { "100|pln|one_time|||unspecified": "price_old" } }]]);
		expect(codes(priceCart(build({ cart: cartOf(["pr1", 1]), catalogLinks: stale })))).toEqual([CART_ISSUE.notSynced]);
		expect(codes(priceCart(build({ cart: cartOf(["pr1", 1]), catalogLinks: new Map() })))).toEqual([CART_ISSUE.notSynced]);
	});

	it("enforces the per-line quantity and line-count limits", () => {
		const tooMany = priceCart(build({ cart: cartOf(["pr1", 100]) }));
		expect(tooMany.issues[0]).toMatchObject({ code: CART_ISSUE.quantityLimit, priceId: "pr1", available: 99 });
		const prices = new Map([["pr1", price()], ["pr2", price({ id: "pr2" })], ["pr3", price({ id: "pr3" })]]);
		const wide = priceCart(build({ cart: cartOf(["pr1", 1], ["pr2", 1], ["pr3", 1]), prices, options: { maxLines: 2, maxQuantityPerLine: 99, supportedCurrencies: ["pln"] } }));
		expect(wide.issues).toEqual([expect.objectContaining({ code: CART_ISSUE.quantityLimit, priceId: null })]);
	});

	it("rejects mixed currencies and returns no subtotal", () => {
		const prices = new Map([["pr1", price()], ["pr2", price({ id: "pr2", currency: eur })]]);
		const result = priceCart(build({ cart: cartOf(["pr1", 1], ["pr2", 1]), prices }));
		expect(codes(result)).toEqual([CART_ISSUE.mixedCurrency]);
		expect(result.currency).toBeNull();
		expect(result.subtotal).toBeNull();
	});

	it("rejects subscriptions with different billing intervals but allows the same one", () => {
		const recurring = (id: string, interval: "month" | "year") =>
			price({ id, type: PRICE_TYPE.recurring, recurring: { interval, intervalCount: 1, trialDays: null } });
		const mixed = priceCart(build({ cart: cartOf(["a", 1], ["b", 1]), prices: new Map([["a", recurring("a", "month")], ["b", recurring("b", "year")]]) }));
		expect(codes(mixed)).toEqual([CART_ISSUE.mixedInterval]);
		const same = priceCart(build({ cart: cartOf(["a", 1], ["b", 1]), prices: new Map([["a", recurring("a", "month")], ["b", recurring("b", "month")]]) }));
		expect(same.issues).toEqual([]);
	});
});

describe("priceCart: stock", () => {
	const tracked = { products: new Map([["p1", product({ inventory: { isTracked: true, allowsBackorder: false } })]]) };

	it("untracked stock reports null availability and never raises a stock issue", () => {
		const result = priceCart(build({ cart: cartOf(["pr1", 5]), stock: new Map([[sellableKey({ kind: "product", id: "p1" }), level({ kind: "product", id: "p1" }, 0)]]) }));
		expect(result.lines[0]!.available).toBeNull();
		expect(result.issues).toEqual([]);
	});

	it("reports out of stock with available 0, also when no stock level exists yet", () => {
		const result = priceCart(build({ cart: cartOf(["pr1", 1]), ...tracked }));
		expect(result.issues).toEqual([expect.objectContaining({ code: CART_ISSUE.outOfStock, priceId: "pr1", available: 0 })]);
	});

	it("reports insufficient stock with the units left", () => {
		const stock = new Map([["product:p1", level({ kind: "product", id: "p1" }, 2)]]);
		const result = priceCart(build({ cart: cartOf(["pr1", 3]), stock, ...tracked }));
		expect(result.issues).toEqual([expect.objectContaining({ code: CART_ISSUE.insufficientStock, available: 2 })]);
		expect(priceCart(build({ cart: cartOf(["pr1", 2]), stock, ...tracked })).issues).toEqual([]);
	});

	it("sums demand across two prices of one sellable", () => {
		const prices = new Map([["pr1", price()], ["pr2", price({ id: "pr2", unitAmount: 900 })]]);
		const stock = new Map([["product:p1", level({ kind: "product", id: "p1" }, 3)]]);
		const result = priceCart(build({ cart: cartOf(["pr1", 2], ["pr2", 2]), prices, stock, ...tracked }));
		expect(result.issues.map((item) => item.priceId)).toEqual(["pr1", "pr2"]);
	});

	it("uses the variant's policy and stock for variant prices", () => {
		const prices = new Map([["pr1", price({ variantId: "v1" })]]);
		const stock = new Map([["variant:v1", level({ kind: "variant", id: "v1" }, 1)]]);
		const result = priceCart(build({ cart: cartOf(["pr1", 2]), prices, stock, variants: new Map([["v1", variant()]]) }));
		expect(result.lines[0]!.sellable).toEqual({ kind: "variant", id: "v1" });
		expect(codes(result)).toEqual([CART_ISSUE.insufficientStock]);
	});

	it("backorder never raises a stock issue, even below zero", () => {
		const backorder = { products: new Map([["p1", product({ inventory: { isTracked: true, allowsBackorder: true } })]]) };
		const stock = new Map([["product:p1", level({ kind: "product", id: "p1" }, -4)]]);
		const result = priceCart(build({ cart: cartOf(["pr1", 10]), stock, ...backorder }));
		expect(result.issues).toEqual([]);
		expect(result.lines[0]!.available).toBe(0);
	});

	it("does not count a cart's own reservation against itself", () => {
		// 5 on hand, this cart holds 3 → storage shows available 2.
		const stock = new Map([["product:p1", level({ kind: "product", id: "p1" }, 2, 3)]]);
		const own = [{ sellable: { kind: "product" as const, id: "p1" }, quantity: 3 }];
		expect(codes(priceCart(build({ cart: cartOf(["pr1", 3]), stock, ...tracked })))).toEqual([CART_ISSUE.insufficientStock]);
		const withOwn = priceCart(build({ cart: cartOf(["pr1", 3]), stock, ownReservation: own, ...tracked }));
		expect(withOwn.issues).toEqual([]);
		expect(withOwn.lines[0]!.available).toBe(5);
	});
});
