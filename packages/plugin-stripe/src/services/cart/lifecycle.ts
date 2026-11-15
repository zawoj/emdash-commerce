import { CART_STATUS, type Cart, type CartRequestContext } from "../../core/cart.js";
import { CommerceError } from "../../core/errors.js";
import type { CommerceContainer } from "../../plugin/container.js";

const DAY_MS = 24 * 60 * 60 * 1000;

const LIVE_STATUSES: readonly Cart["status"][] = [CART_STATUS.active, CART_STATUS.checkoutOpen, CART_STATUS.abandoned];

/** The cart ttl window starting now; every persisted change slides it. */
export const cartExpiry = (container: CommerceContainer): string =>
	new Date(container.clock.now().getTime() + container.options.cart.ttlDays * DAY_MS).toISOString();

/** A cart a buyer can still use: not converted or expired, and inside its ttl. */
export const isCartLive = (cart: Cart, nowIso: string): boolean => LIVE_STATUSES.includes(cart.status) && cart.expiresAt > nowIso;

/** 24 random bytes encode to the 32 base64url characters `CART_ID_PATTERN` accepts. */
const CART_ID_BYTES = 24;

export const createEmptyCart = (container: CommerceContainer, context: CartRequestContext): Cart => {
	const now = container.clock.now().toISOString();
	return {
		id: container.ids.randomId(CART_ID_BYTES),
		status: CART_STATUS.active,
		lines: [],
		email: null,
		checkout: null,
		orderId: null,
		context,
		createdAt: now,
		updatedAt: now,
		expiresAt: cartExpiry(container),
	};
};

export interface LoadedCart {
	cart: Cart;
	/** Null for a cart that is not stored yet. */
	revision: string | null;
	isNew: boolean;
}

/**
 * The cart behind a bearer id, or a fresh unsaved one. A missing, expired or converted id never revives
 * (a converted cart is never modified) and is never reused for the new cart: the id is a secret the server
 * chooses, so a client cannot pick one.
 */
export const loadCart = async (container: CommerceContainer, cartId: string | null, context: CartRequestContext): Promise<LoadedCart> => {
	if (cartId) {
		const stored = await container.carts.get(cartId);
		if (stored && isCartLive(stored.value, container.clock.now().toISOString())) {
			return { cart: stored.value, revision: stored.revision, isNew: false };
		}
	}
	return { cart: createEmptyCart(container, context), revision: null, isNew: true };
};

/**
 * Closes the open checkout of a cart so its lines can change: refuses when the session already completed
 * (the payment is in flight, settlement will convert the cart), otherwise expires the provider session and
 * releases the stock hold. Both calls are idempotent, so a retry after a lost compare-and-set repeats them
 * harmlessly. Returns the cart as `active`; the caller persists it with its own compare-and-set.
 */
export const unlockCheckout = async (container: CommerceContainer, cart: Cart): Promise<Cart> => {
	const checkout = cart.checkout;
	if (cart.status !== CART_STATUS.checkoutOpen || !checkout) return cart;
	if (checkout.sessionId) {
		const provider = await container.provider();
		const session = await provider.checkout.retrieveSession(checkout.sessionId);
		if (session?.status === "complete") {
			throw new CommerceError("cartLocked", "This cart is being paid for and cannot change.");
		}
		if (session?.status === "open") await provider.checkout.expireSession(checkout.sessionId);
	}
	if (checkout.reservationId) await container.inventory.release(checkout.reservationId);
	return { ...cart, status: CART_STATUS.active, checkout: null };
};
