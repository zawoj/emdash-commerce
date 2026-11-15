import type { CartLineContent } from "@emdash-commerce/design-system";
import type { CartView } from "@emdash-commerce/plugin-stripe/contracts";

import type { Locale } from "../../lib/i18n";
import { formatMoney, toDecimalString } from "../../lib/money";
import { cartStrings } from "../../lib/strings";
import { commerceApiBase, fetchCatalogProducts, parseApiEnvelope } from "../../utils/commerce-fetch";
import { LINE_FIELDS } from "./constants";
import { MINI_CART_ID } from "../shell/tab-bar";

export interface CartSummary {
	count: number;
	subtotal: { amount: number; label: string };
	isEmpty: boolean;
	lines: CartLineContent[];
}

/** Product page href for a cart line; prefers catalog slug over the internal product id. */
export const productHrefForLine = (productId: string, slugByProductId: ReadonlyMap<string, string>): string => {
	const slug = slugByProductId.get(productId);
	return slug ? `/shop/${slug}` : `/shop/${productId}`;
};

export const lineContents = (
	cart: CartView,
	locale: Locale,
	slugByProductId: ReadonlyMap<string, string> = new Map(),
): CartLineContent[] => {
	const copy = cartStrings(locale);
	return cart.lines.map((line) => ({
		id: line.priceId,
		name: { label: line.title, href: productHrefForLine(line.productId, slugByProductId) },
		variantText: line.variantTitle ?? undefined,
		unitPrice: {
			label: formatMoney(line.unitAmount.amount, locale, line.unitAmount.currency),
			value: Number(toDecimalString(line.unitAmount.amount)),
		},
		linePrice: {
			label: formatMoney(line.lineTotal.amount, locale, line.lineTotal.currency),
			value: Number(toDecimalString(line.lineTotal.amount)),
		},
		quantity: {
			name: `${LINE_FIELDS.quantityPrefix}[${line.priceId}]`,
			value: line.quantity,
			min: 0,
			max: 99,
			label: copy.columnQuantity,
			decreaseLabel: copy.columnQuantity,
			increaseLabel: copy.columnQuantity,
		},
		remove: {
			label: copy.removeLine,
			name: LINE_FIELDS.remove,
			value: line.priceId,
		},
	}));
};

const slugMapForProducts = async (origin: string, productIds: readonly string[]): Promise<Map<string, string>> => {
	const unique = [...new Set(productIds)];
	if (unique.length === 0) return new Map();
	const catalog = await fetchCatalogProducts(origin, { limit: 200 });
	const map = new Map<string, string>();
	for (const item of catalog?.items ?? []) {
		if (unique.includes(item.id)) map.set(item.id, item.slug);
	}
	return map;
};

const fetchCartServer = async (request: Request): Promise<CartView | null> => {
	const origin = new URL(request.url).origin;
	const res = await fetch(`${origin}${commerceApiBase}/cart`, {
		headers: {
			accept: "application/json",
			cookie: request.headers.get("cookie") ?? "",
		},
	});
	const json = await res.json();
	if (!res.ok) return null;
	const { data } = parseApiEnvelope<CartView>(json);
	return data;
};

export const loadSummary = async (request: Request, locale: Locale): Promise<CartSummary> => {
	const origin = new URL(request.url).origin;
	const cart = await fetchCartServer(request);
	if (!cart || cart.lines.length === 0) {
		return {
			count: 0,
			subtotal: { amount: 0, label: formatMoney(0, locale) },
			isEmpty: true,
			lines: [],
		};
	}
	const slugByProductId = await slugMapForProducts(
		origin,
		cart.lines.map((line) => line.productId),
	);
	const amount = cart.subtotal?.amount ?? 0;
	return {
		count: cart.itemCount,
		subtotal: { amount, label: formatMoney(amount, locale, cart.subtotal?.currency ?? "PLN") },
		isEmpty: false,
		lines: lineContents(cart, locale, slugByProductId),
	};
};

export const miniCartId = (): string => MINI_CART_ID;
