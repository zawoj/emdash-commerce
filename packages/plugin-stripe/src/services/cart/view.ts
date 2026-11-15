import type { CartView } from "../../contracts/api.js";
import type { PricedCart } from "../../core/cart.js";

export const toCartView = (priced: PricedCart, isNew: boolean): CartView => ({
	cartId: priced.cart.id,
	isNew,
	status: priced.cart.status,
	lines: priced.lines.map((line) => ({
		priceId: line.priceId,
		productId: line.productId,
		variantId: line.variantId,
		title: line.title,
		variantTitle: line.variantTitle,
		quantity: line.quantity,
		unitAmount: line.unitAmount,
		lineTotal: line.lineTotal,
		priceType: line.priceType,
		interval: line.interval,
		intervalCount: line.intervalCount,
		trialDays: line.trialDays,
		available: line.available,
	})),
	itemCount: priced.itemCount,
	subtotal: priced.subtotal,
	mode: priced.mode,
	issues: priced.issues.map((issue) => ({
		code: issue.code,
		priceId: issue.priceId,
		message: issue.message,
		...(issue.available === undefined ? {} : { available: issue.available }),
	})),
	isCheckoutReady: priced.isCheckoutReady,
	expiresAt: priced.cart.expiresAt,
});
