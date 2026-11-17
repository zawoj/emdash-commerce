import type { CheckoutView } from "../../contracts/api.js";
import { CART_STATUS, type Cart } from "../../core/cart.js";
import type { CheckoutSnapshot } from "../../ports/repositories.js";
import type { CommerceContainer } from "../../plugin/container.js";

const lineKey = (line: { priceId: string; quantity: number }): string => `${line.priceId}x${line.quantity}`;

/** Same price ids and quantities, in any order. */
export const hasSameLines = (cartLines: readonly { priceId: string; quantity: number }[], snapshotLines: readonly { priceId: string; quantity: number }[]): boolean => {
	if (cartLines.length !== snapshotLines.length) return false;
	const wanted = new Set(cartLines.map(lineKey));
	return snapshotLines.every((line) => wanted.has(lineKey(line)));
};

/**
 * The open session a repeated checkout request should get back (double click, two tabs, a retry after a
 * timeout): the cart is `checkout_open` with an unexpired session whose snapshot was made for exactly
 * these lines and this UI mode, and the snapshot still holds what the buyer needs (the url or the client
 * secret). Anything else is not reused.
 */
export const findReusableSession = async (container: CommerceContainer, cart: Cart, uiMode: "hosted" | "embedded"): Promise<CheckoutView | null> => {
	const checkout = cart.checkout;
	if (cart.status !== CART_STATUS.checkoutOpen || !checkout?.sessionId) return null;
	if (checkout.expiresAt <= container.clock.now().toISOString()) return null;
	const snapshot: CheckoutSnapshot | null = await container.snapshots.getBySession(checkout.sessionId);
	if (!snapshot || snapshot.uiMode !== uiMode || snapshot.cartId !== cart.id) return null;
	if (snapshot.reservationId !== checkout.reservationId || !hasSameLines(cart.lines, snapshot.lines)) return null;
	const url = snapshot.sessionUrl ?? null;
	const clientSecret = snapshot.clientSecret ?? null;
	if (uiMode === "hosted" ? !url : !clientSecret) return null;
	return { sessionId: checkout.sessionId, uiMode, url: uiMode === "hosted" ? url : null, clientSecret: uiMode === "embedded" ? clientSecret : null, expiresAt: checkout.expiresAt };
};
