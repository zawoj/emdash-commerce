import type { z } from "zod";

import type { CartView, cartLineInput } from "../contracts/api.js";
import { CART_STATUS, type Cart, type CartRequestContext } from "../core/cart.js";
import { CommerceError } from "../core/errors.js";
import type { CommerceContainer } from "../plugin/container.js";
import { applyLineChange, sameLines, type LineChange } from "./cart/lines.js";
import { cartExpiry, loadCart, unlockCheckout, type LoadedCart } from "./cart/lifecycle.js";
import { loadCatalogFor, loadPricedCart } from "./cart/pricing.js";
import { mirrorCart } from "./cart/mirror.js";
import { toCartView } from "./cart/view.js";
import type { StorefrontDeps } from "./cart/deps.js";

/** Two tabs adding at once both land: a lost compare-and-set re-reads and re-applies the change. */
const MAX_CAS_ATTEMPTS = 10;

export interface CartService {
	/** Never persists: an unknown, expired or converted id yields a fresh unsaved cart (`isNew`). */
	get(cartId: string | null, context: CartRequestContext): Promise<CartView>;
	/** `add` increments, `set` replaces; creates the cart on its first line. */
	setLine(cartId: string | null, input: CartLineInput, context: CartRequestContext): Promise<CartView>;
	removeLine(cartId: string | null, priceId: string, context: CartRequestContext): Promise<CartView>;
}

export type CartLineInput = z.infer<typeof cartLineInput>;

/** A line can be added only for a price a buyer could buy now: it exists, and it and its owners are active. */
const assertSellable = async (container: CommerceContainer, priceId: string): Promise<void> => {
	const { prices, products, variants } = await loadCatalogFor(container, [priceId]);
	const price = prices.get(priceId);
	const product = price ? products.get(price.productId) : undefined;
	if (!price || !product) throw new CommerceError("notFound", "This item does not exist.", { priceId });
	const variant = price.variantId ? variants.get(price.variantId) : undefined;
	if (price.variantId && !variant) throw new CommerceError("notFound", "This item does not exist.", { priceId });
	if (!price.isActive || !product.isPublished || (variant && !variant.isActive)) {
		throw new CommerceError("conflict", "This item is not available.", { priceId });
	}
	if (!container.options.supportedCurrencies.includes(price.currency)) {
		throw new CommerceError("conflict", "This item cannot be bought in a supported currency.", { priceId });
	}
};

export const createCartService = (container: CommerceContainer, deps: StorefrontDeps): CartService => {
	const view = async (loaded: LoadedCart, options: { isPersisted: boolean }): Promise<CartView> => {
		const priced = await loadPricedCart(container, deps.extensionContext, loaded.cart);
		if (options.isPersisted) await mirrorCart(container, priced);
		return toCartView(priced, loaded.isNew);
	};

	const mutate = async (cartId: string | null, context: CartRequestContext, change: LineChange): Promise<CartView> => {
		const limits = container.options.cart;
		for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
			const loaded = await loadCart(container, cartId, context);
			const nowIso = container.clock.now().toISOString();
			const lines = applyLineChange(loaded.cart.lines, change, limits, nowIso);
			// Nothing to store: an unchanged cart, or a first change that leaves a new cart empty.
			if (sameLines(lines, loaded.cart.lines)) return view(loaded, { isPersisted: false });

			// An open checkout is closed first, so its session cannot be paid with the old lines.
			const open = await unlockCheckout(container, loaded.cart);
			const next: Cart = {
				...open,
				status: open.status === CART_STATUS.abandoned ? CART_STATUS.active : open.status,
				lines,
				updatedAt: nowIso,
				expiresAt: cartExpiry(container),
			};
			const stored = await container.carts.put(next, loaded.revision);
			if (stored.applied) return view({ ...loaded, cart: next }, { isPersisted: true });
		}
		throw new CommerceError("conflict", "The cart is being changed elsewhere. Try again.");
	};

	return {
		async get(cartId, context) {
			return view(await loadCart(container, cartId, context), { isPersisted: false });
		},
		async setLine(cartId, input, context) {
			if (input.quantity > 0) await assertSellable(container, input.priceId);
			return mutate(cartId, context, { priceId: input.priceId, quantity: input.quantity, mode: input.mode });
		},
		async removeLine(cartId, priceId, context) {
			return mutate(cartId, context, { priceId, mode: "remove" });
		},
	};
};
