import { setLookCartAdapter } from "@emdash-commerce/design-system/look-dialog";

import { addPriceToCart } from "../../../utils/add-to-cart";
import { commerceApiBase, parseApiEnvelope } from "../../../utils/commerce-fetch";
import type { CheckoutView } from "@emdash-commerce/plugin-stripe/contracts";
import { announceCartChange, openMiniCart } from "./events";

declare global {
	interface Window {
		__lookPriceMap?: Record<number, Record<number, string>>;
		__lookKitCheckout?: boolean;
	}
}

let kitCartId: string | undefined;

const startKitCheckout = async (): Promise<void> => {
	if (!kitCartId) return;
	const res = await fetch(`${commerceApiBase}/checkout`, {
		method: "POST",
		credentials: "omit",
		headers: {
			"Content-Type": "application/json",
			"X-EmDash-Request": "1",
			"x-commerce-cart": kitCartId,
		},
		body: JSON.stringify({ uiMode: "hosted" }),
	});
	const { data } = parseApiEnvelope<CheckoutView>(await res.json());
	if (data?.url) window.location.href = data.url;
	window.__lookKitCheckout = false;
	kitCartId = undefined;
};

setLookCartAdapter({
	add: async ({ variantId, quantity, productId }) => {
		const priceId = window.__lookPriceMap?.[productId]?.[variantId];
		if (!priceId) return { ok: false, message: "Unknown variant" };
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
			"X-EmDash-Request": "1",
		};
		if (kitCartId) headers["x-commerce-cart"] = kitCartId;
		const res = await fetch(`${commerceApiBase}/cart/lines`, {
			method: "POST",
			credentials: window.__lookKitCheckout ? "omit" : "include",
			headers,
			body: JSON.stringify({ priceId, quantity, mode: "add" }),
		});
		const json = await res.json();
		const { data } = parseApiEnvelope<{ itemCount: number; cartId: string }>(json);
		if (!res.ok || !data) return { ok: false, message: "Could not add" };
		if (window.__lookKitCheckout) kitCartId = data.cartId;
		else await import("../../../utils/commerce-fetch").then((m) => m.persistCartFromView({ cartId: data.cartId, isNew: true }));
		return { ok: true, count: data.itemCount };
	},
	onAdded: ({ count, shouldOpenCart }) => {
		if (window.__lookKitCheckout && shouldOpenCart) {
			void startKitCheckout();
			return;
		}
		if (typeof count === "number") announceCartChange({ count, shouldOpenDrawer: shouldOpenCart });
		if (shouldOpenCart) openMiniCart();
	},
});

document.addEventListener(
	"click",
	(event) => {
		const target = (event.target as Element).closest("[data-look-kit]");
		if (!target) return;
		window.__lookKitCheckout = true;
		kitCartId = undefined;
	},
	true,
);

export {};
