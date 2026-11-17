import {
	CART_ISSUE,
	type Cart,
	type CartIssue,
	type CheckoutMode,
	type PricedCart,
	type PricedCartLine,
} from "./cart.js";
import {
	PRICE_TYPE,
	priceTermsFingerprint,
	sellableKey,
	sellableOfPrice,
	type InventoryPolicy,
	type Price,
	type Product,
	type SellableRef,
	type Variant,
} from "./catalog.js";
import type { ReservationLine, StockLevel } from "./inventory.js";
import { add, money, multiply, type CurrencyCode, type Money } from "./money.js";

/**
 * Server-side cart pricing: the client sends price ids and quantities, this derives everything else
 * (amounts, currency, checkout mode, availability) from catalog state. Pure: callers load the
 * catalog, stock and sync links first, so the same function prices a cart for the storefront view and
 * re-validates it right before a Checkout Session is created.
 */

export interface PricingOptions {
	maxLines: number;
	maxQuantityPerLine: number;
	supportedCurrencies: readonly string[];
}

/** Sync state of one price: the provider price per terms fingerprint (see `priceTermsFingerprint`). */
export interface PriceSyncLink {
	providerPriceByFingerprint: Readonly<Record<string, string>>;
}

export interface PriceCartInput {
	cart: Cart;
	prices: ReadonlyMap<string, Price>;
	products: ReadonlyMap<string, Product>;
	variants: ReadonlyMap<string, Variant>;
	/** Keyed by `sellableKey`. */
	stock: ReadonlyMap<string, StockLevel>;
	/** Keyed by price id. */
	catalogLinks: ReadonlyMap<string, PriceSyncLink>;
	options: PricingOptions;
	/**
	 * Lines already reserved for this very cart (an open checkout). Their units are held out of
	 * `available`, so they are added back; otherwise a cart could never re-check against itself.
	 */
	ownReservation?: readonly ReservationLine[];
}

interface PricedEntry {
	line: PricedCartLine;
	policy: InventoryPolicy;
}

const issue = (code: CartIssue["code"], priceId: string | null, message: string, available?: number): CartIssue =>
	available === undefined ? { code, priceId, message } : { code, priceId, message, available };

const sumBy = <T>(items: readonly T[], pick: (item: T) => number): number =>
	items.reduce((total, item) => total + pick(item), 0);

const ownReservedUnits = (ref: SellableRef, own: readonly ReservationLine[] | undefined): number =>
	own ? sumBy(own.filter((line) => sellableKey(line.sellable) === sellableKey(ref)), (line) => line.quantity) : 0;

/** Null when stock is not tracked; never negative (a level can go below zero through backorder). */
const availableUnits = (
	policy: InventoryPolicy,
	ref: SellableRef,
	input: PriceCartInput,
): number | null => {
	if (!policy.isTracked) return null;
	const level = input.stock.get(sellableKey(ref));
	const raw = (level?.available ?? 0) + ownReservedUnits(ref, input.ownReservation);
	return Math.max(0, raw);
};

const hasProviderPrice = (price: Price, links: ReadonlyMap<string, PriceSyncLink>): boolean => {
	const link = links.get(price.id);
	return Boolean(link?.providerPriceByFingerprint[priceTermsFingerprint(price)]);
};

const toPricedLine = (
	price: Price,
	product: Product,
	variant: Variant | null,
	quantity: number,
	available: number | null,
): PricedCartLine => ({
	priceId: price.id,
	productId: product.id,
	variantId: price.variantId,
	sellable: sellableOfPrice(price),
	title: product.title,
	variantTitle: variant?.title ?? null,
	quantity,
	unitAmount: money(price.unitAmount, price.currency),
	lineTotal: multiply(money(price.unitAmount, price.currency), quantity),
	priceType: price.type,
	interval: price.recurring?.interval ?? null,
	intervalCount: price.recurring?.intervalCount ?? null,
	trialDays: price.recurring?.trialDays ?? null,
	available,
});

/** Line-level checks that do not depend on other lines. */
const lineIssues = (
	price: Price,
	product: Product,
	variant: Variant | null,
	quantity: number,
	input: PriceCartInput,
): CartIssue[] => {
	const issues: CartIssue[] = [];
	if (!price.isActive) issues.push(issue(CART_ISSUE.priceInactive, price.id, "This price is no longer offered."));
	if (!input.options.supportedCurrencies.includes(price.currency)) {
		issues.push(issue(CART_ISSUE.priceInactive, price.id, `Currency ${price.currency} is not supported.`));
	}
	if (!product.isPublished) issues.push(issue(CART_ISSUE.productUnpublished, price.id, `${product.title} is not available.`));
	if (price.variantId && (!variant || !variant.isActive)) {
		issues.push(issue(CART_ISSUE.variantInactive, price.id, `${product.title} is not available in this variation.`));
	}
	if (quantity > input.options.maxQuantityPerLine) {
		issues.push(
			issue(CART_ISSUE.quantityLimit, price.id, `At most ${input.options.maxQuantityPerLine} per item.`, input.options.maxQuantityPerLine),
		);
	}
	if (!hasProviderPrice(price, input.catalogLinks)) {
		issues.push(issue(CART_ISSUE.notSynced, price.id, "This item is not ready for checkout yet."));
	}
	return issues;
};

/** Demand per sellable across lines, so two prices of one variant cannot each claim the last unit. */
const stockIssues = (entries: readonly PricedEntry[], input: PriceCartInput): CartIssue[] => {
	const demand = new Map<string, number>();
	for (const { line } of entries) {
		const key = sellableKey(line.sellable);
		demand.set(key, (demand.get(key) ?? 0) + line.quantity);
	}
	const issues: CartIssue[] = [];
	for (const { line, policy } of entries) {
		if (line.available === null || policy.allowsBackorder) continue;
		if ((demand.get(sellableKey(line.sellable)) ?? 0) <= line.available) continue;
		issues.push(
			line.available === 0
				? issue(CART_ISSUE.outOfStock, line.priceId, `${line.title} is out of stock.`, 0)
				: issue(CART_ISSUE.insufficientStock, line.priceId, `Only ${line.available} of ${line.title} left.`, line.available),
		);
	}
	return issues;
};

const cartWideIssues = (lines: readonly PricedCartLine[], cart: Cart, options: PricingOptions): CartIssue[] => {
	const issues: CartIssue[] = [];
	if (cart.lines.length > options.maxLines) {
		issues.push(issue(CART_ISSUE.quantityLimit, null, `A cart holds at most ${options.maxLines} different items.`));
	}
	if (new Set(lines.map((line) => line.unitAmount.currency)).size > 1) {
		issues.push(issue(CART_ISSUE.mixedCurrency, null, "All items in a cart must use the same currency."));
	}
	const intervals = new Set(
		lines.filter((line) => line.priceType === PRICE_TYPE.recurring).map((line) => `${line.interval}:${line.intervalCount}`),
	);
	if (intervals.size > 1) {
		issues.push(issue(CART_ISSUE.mixedInterval, null, "Subscriptions in one cart must share a billing interval."));
	}
	return issues;
};

const cartCurrency = (lines: readonly PricedCartLine[]): CurrencyCode | null => {
	const currencies = new Set(lines.map((line) => line.unitAmount.currency));
	return currencies.size === 1 ? [...currencies][0]! : null;
};

const cartSubtotal = (lines: readonly PricedCartLine[], currency: CurrencyCode | null): Money | null => {
	if (!currency) return null;
	return lines.reduce<Money>((total, line) => add(total, line.lineTotal), money(0, currency));
};

const cartMode = (cart: Cart, lines: readonly PricedCartLine[]): CheckoutMode | null => {
	if (cart.lines.length === 0 || lines.length === 0) return null;
	return lines.some((line) => line.priceType === PRICE_TYPE.recurring) ? "subscription" : "payment";
};

export const priceCart = (input: PriceCartInput): PricedCart => {
	const { cart } = input;
	const issues: CartIssue[] = [];
	const entries: PricedEntry[] = [];

	for (const cartLine of cart.lines) {
		const price = input.prices.get(cartLine.priceId);
		if (!price) {
			issues.push(issue(CART_ISSUE.priceNotFound, cartLine.priceId, "This item no longer exists."));
			continue;
		}
		const product = input.products.get(price.productId);
		if (!product) {
			issues.push(issue(CART_ISSUE.productUnpublished, price.id, "This item is not available."));
			continue;
		}
		const variant = price.variantId ? (input.variants.get(price.variantId) ?? null) : null;
		const policy = variant?.inventory ?? product.inventory;
		const available = availableUnits(policy, sellableOfPrice(price), input);
		issues.push(...lineIssues(price, product, variant, cartLine.quantity, input));
		entries.push({ line: toPricedLine(price, product, variant, cartLine.quantity, available), policy });
	}

	const lines = entries.map((entry) => entry.line);
	issues.push(...stockIssues(entries, input), ...cartWideIssues(lines, cart, input.options));

	const currency = cartCurrency(lines);
	return {
		cart,
		lines,
		currency,
		subtotal: cartSubtotal(lines, currency),
		itemCount: sumBy(cart.lines, (line) => line.quantity),
		mode: cartMode(cart, lines),
		issues,
		isCheckoutReady: cart.lines.length > 0 && lines.length === cart.lines.length && issues.length === 0,
	};
};
