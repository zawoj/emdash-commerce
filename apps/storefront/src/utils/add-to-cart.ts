import type { CartView } from "@emdash-commerce/plugin-stripe/contracts";

import { announceCartChange } from "../features/cart/client/events";
import { commerceApiBase, parseApiEnvelope, persistCartFromView } from "./commerce-fetch";

export interface CartLineInputBody {
	priceId: string;
	quantity: number;
	mode: "add" | "set";
}

export const buildCartLineBody = (
	priceId: string,
	quantity = 1,
	mode: "add" | "set" = "add",
): CartLineInputBody => ({ priceId, quantity, mode });

export const addPriceToCart = async (
	priceId: string,
	quantity = 1,
	options?: { credentials?: RequestCredentials; cartHeader?: string },
): Promise<{ ok: boolean; count?: number; cartId?: string }> => {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		"X-EmDash-Request": "1",
	};
	if (options?.cartHeader) headers["x-commerce-cart"] = options.cartHeader;
	const res = await fetch(`${commerceApiBase}/cart/lines`, {
		method: "POST",
		credentials: options?.credentials ?? "include",
		headers,
		body: JSON.stringify(buildCartLineBody(priceId, quantity, "add")),
	});
	const json = await res.json();
	if (!res.ok) return { ok: false };
	const { data } = parseApiEnvelope<CartView>(json);
	if (!data) return { ok: false };

	if (options?.credentials !== "omit") await persistCartFromView(data);

	announceCartChange({ count: data.itemCount, shouldOpenDrawer: options?.credentials !== "omit" });
	return { ok: true, count: data.itemCount, cartId: data.cartId };
};

/** Alias for call sites that still use the old name. */
export const addProductToCart = (apiBase: string, priceId: string) => addPriceToCart(priceId);
