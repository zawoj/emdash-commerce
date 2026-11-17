import type {
	CartView,
	CatalogProductsQuery,
	CatalogProductsView,
	CheckoutStatusView,
	OrderView,
	ProductDetailView,
} from "@emdash-commerce/plugin-stripe/contracts";

import { ORDER_LINK_STATES, ORDER_TOKEN_PARAM } from "../features/orders/constants";

/** Matches `PLUGIN_ID` in the plugin; kept literal so client bundles do not import the plugin entrypoint. */
export const commerceApiBase = "/_emdash/api/plugins/stripe-commerce";

const JSON_MUTATION_HEADERS = {
	"Content-Type": "application/json",
	"X-EmDash-Request": "1",
} as const;

interface ApiEnvelope<T> {
	data?: T;
	error?: { code: string; message: string };
}

export const parseApiEnvelope = <T>(json: unknown): { data: T | null; error: ApiEnvelope<T>["error"] } => {
	if (typeof json !== "object" || json === null) return { data: null, error: undefined };
	const envelope = json as ApiEnvelope<T>;
	return { data: envelope.data ?? null, error: envelope.error };
};

/** Non-GET plugin calls require JSON + X-EmDash-Request; cart id is sent via the httpOnly cookie (credentials: include). */
export const commerceMutationInit = (body?: unknown): RequestInit => ({
	method: "POST",
	credentials: "include",
	headers: JSON_MUTATION_HEADERS,
	body: body === undefined ? undefined : JSON.stringify(body),
});

export const syncCartCookie = async (cartId: string, origin?: string): Promise<void> => {
	const url = origin ? `${origin}/api/cart-cookie` : "/api/cart-cookie";
	await fetch(url, {
		method: "POST",
		credentials: "include",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ cartId }),
	});
};

export const persistCartFromView = async (
	cart: Pick<CartView, "cartId" | "isNew">,
	origin?: string,
): Promise<void> => {
	if (cart.isNew) await syncCartCookie(cart.cartId, origin);
};

const catalogUrl = (origin: string, path: string, query: Record<string, string | undefined>): URL => {
	const url = new URL(`${commerceApiBase}/${path}`, origin);
	for (const [key, value] of Object.entries(query)) {
		if (value) url.searchParams.set(key, value);
	}
	return url;
};

export const fetchCatalogProducts = async (
	origin: string,
	query: CatalogProductsQuery = {},
): Promise<CatalogProductsView | null> => {
	const url = catalogUrl(origin, "catalog/products", {
		category: query.category,
		brand: query.brand,
		limit: query.limit ? String(query.limit) : undefined,
		sort: query.sort,
	});
	const res = await fetch(url, { headers: { accept: "application/json" } });
	const json = await res.json();
	if (!res.ok) return null;
	const { data } = parseApiEnvelope<CatalogProductsView>(json);
	return data;
};

export const fetchCatalogProductDetail = async (
	origin: string,
	slug: string,
): Promise<ProductDetailView | null> => {
	const url = catalogUrl(origin, "catalog/product", { slug });
	const res = await fetch(url, { headers: { accept: "application/json" } });
	const json = await res.json();
	if (!res.ok) return null;
	const { data } = parseApiEnvelope<ProductDetailView>(json);
	return data;
};

/** @deprecated Use `fetchCatalogProductDetail`. */
export const fetchCatalogProduct = fetchCatalogProductDetail;

export const fetchCart = async (init: RequestInit = {}): Promise<CartView | null> => {
	const res = await fetch(`${commerceApiBase}/cart`, {
		credentials: "include",
		headers: { accept: "application/json" },
		...init,
	});
	const json = await res.json();
	if (!res.ok) return null;
	const { data } = parseApiEnvelope<CartView>(json);
	return data;
};

export const fetchCheckoutStatus = async (
	origin: string,
	sessionId: string,
): Promise<CheckoutStatusView | null> => {
	const url = new URL(`${commerceApiBase}/checkout/status`, origin);
	url.searchParams.set("session_id", sessionId);
	const res = await fetch(url, { headers: { accept: "application/json" } });
	const json = await res.json();
	if (!res.ok) return null;
	const { data } = parseApiEnvelope<CheckoutStatusView>(json);
	return data;
};

export const startCheckout = async (uiMode: "hosted" | "embedded" = "hosted"): Promise<{ url: string | null }> => {
	const res = await fetch(`${commerceApiBase}/checkout`, {
		...commerceMutationInit({ uiMode }),
	});
	const json = await res.json();
	const { data } = parseApiEnvelope<{ url: string | null }>(json);
	return { url: data?.url ?? null };
};

export type OrderViewResult =
	| { state: typeof ORDER_LINK_STATES.ok; view: OrderView }
	| { state: typeof ORDER_LINK_STATES.invalid | typeof ORDER_LINK_STATES.unavailable };

/** The guest order behind a signed link. The plugin answers 401 for an invalid or expired token and 400 for one that is not even shaped like a token; anything else is "unavailable". */
export const fetchOrderView = async (origin: string, token: string): Promise<OrderViewResult> => {
	const url = new URL(`${commerceApiBase}/orders/view`, origin);
	url.searchParams.set(ORDER_TOKEN_PARAM, token);
	try {
		const res = await fetch(url, { headers: { accept: "application/json" } });
		if (res.status === 401 || res.status === 400) return { state: ORDER_LINK_STATES.invalid };
		if (!res.ok) return { state: ORDER_LINK_STATES.unavailable };
		const { data } = parseApiEnvelope<OrderView>(await res.json());
		return data ? { state: ORDER_LINK_STATES.ok, view: data } : { state: ORDER_LINK_STATES.unavailable };
	} catch {
		return { state: ORDER_LINK_STATES.unavailable };
	}
};
