import type { PricedCart } from "../../core/cart.js";
import type { CommerceContainer } from "../../plugin/container.js";

/** Admin mirror of a persisted cart: best effort, a failure is logged and never fails the buyer's request. */
export const mirrorCart = async (container: CommerceContainer, priced: PricedCart): Promise<void> => {
	try {
		await container.cartMirror.upsert(priced.cart, {
			itemCount: priced.itemCount,
			subtotal: priced.subtotal?.amount ?? null,
			currency: priced.currency,
			lines: priced.lines.map((line) => ({
				priceId: line.priceId,
				productId: line.productId,
				variantId: line.variantId,
				title: line.title,
				variantTitle: line.variantTitle,
				quantity: line.quantity,
				unitAmount: line.unitAmount.amount,
			})),
		});
	} catch (error) {
		container.log.warn("Cart mirror failed", { cartId: priced.cart.id, error: error instanceof Error ? error.message : "unknown" });
	}
};
