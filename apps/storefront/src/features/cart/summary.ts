import type { CartLineContent, ImageAttrs } from "@emdash-commerce/design-system";
import { variantOptionsLabelOf, type CartView, type ProductDetailView } from "@emdash-commerce/plugin-stripe/contracts";

import type { Locale } from "../../lib/i18n";
import { imageFromUrl } from "../../lib/media";
import { formatMoney, toDecimalString } from "../../lib/money";
import { cartStrings } from "../../lib/strings";
import { commerceApiBase, fetchCatalogProductDetail, fetchCatalogProducts, parseApiEnvelope } from "../../utils/commerce-fetch";
import { LINE_FIELDS } from "./constants";
import { MINI_CART_ID } from "../shell/tab-bar";
import { cartPageOf, type CartPageModel } from "./view-model";
import type { CartCopy } from "./copy";

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

interface ProductPhoto {
	url: string;
	alt: string;
}

/**
 * The thumbnail of a cart line: the chosen variant's own photo when it has one, otherwise the product's first photo
 * (a colour without tagged photos still shows the product, never an empty box).
 */
export const pickLineImage = (
	variantId: string | null,
	detail: Pick<ProductDetailView, "title" | "images" | "variants"> | null,
	fallback: ProductPhoto | undefined,
): ProductPhoto | undefined => {
	const variantUrl = variantId ? detail?.variants.find((variant) => variant.id === variantId)?.imageUrls[0] : undefined;
	if (variantUrl) return { url: variantUrl, alt: detail?.title ?? "" };
	const productPhoto = detail?.images[0] ?? fallback;
	return productPhoto ? { url: productPhoto.url, alt: productPhoto.alt } : undefined;
};

export const lineContents = (
	cart: CartView,
	locale: Locale,
	slugByProductId: ReadonlyMap<string, string> = new Map(),
	imageByPriceId: ReadonlyMap<string, ImageAttrs> = new Map(),
): CartLineContent[] => {
	const copy = cartStrings(locale);
	return cart.lines.map((line) => ({
		id: line.priceId,
		name: { label: line.title, href: productHrefForLine(line.productId, slugByProductId) },
		image: imageByPriceId.get(line.priceId),
		variantText: (line.variantTitle && variantOptionsLabelOf(line.title, line.variantTitle)) || undefined,
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

const CART_THUMB_SIZES = "96px";

const catalogForProducts = async (origin: string, productIds: readonly string[]) => {
	const unique = new Set(productIds);
	const catalog = await fetchCatalogProducts(origin, { limit: 200 });
	return (catalog?.items ?? []).filter((item) => unique.has(item.id));
};

/** Thumbnails by price id; variant photos come from the product detail, fetched only for lines that choose a variant. */
const lineImages = async (
	origin: string,
	cart: CartView,
	items: Awaited<ReturnType<typeof catalogForProducts>>,
): Promise<Map<string, ImageAttrs>> => {
	const byProduct = new Map(items.map((item) => [item.id, item]));
	const details = new Map<string, ProductDetailView | null>();
	await Promise.all(
		[...new Set(cart.lines.filter((line) => line.variantId).map((line) => line.productId))].map(async (productId) => {
			const slug = byProduct.get(productId)?.slug;
			details.set(productId, slug ? await fetchCatalogProductDetail(origin, slug) : null);
		}),
	);
	const map = new Map<string, ImageAttrs>();
	for (const line of cart.lines) {
		const photo = pickLineImage(line.variantId, details.get(line.productId) ?? null, byProduct.get(line.productId)?.images[0]);
		const image = photo ? imageFromUrl(photo.url, photo.alt, { sizes: CART_THUMB_SIZES }) : undefined;
		if (image) map.set(line.priceId, image);
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
	const items = await catalogForProducts(
		origin,
		cart.lines.map((line) => line.productId),
	);
	const slugByProductId = new Map(items.map((item) => [item.id, item.slug]));
	const imageByPriceId = await lineImages(origin, cart, items);
	const amount = cart.subtotal?.amount ?? 0;
	return {
		count: cart.itemCount,
		subtotal: { amount, label: formatMoney(amount, locale, cart.subtotal?.currency) },
		isEmpty: false,
		lines: lineContents(cart, locale, slugByProductId, imageByPriceId),
	};
};

export const miniCartId = (): string => MINI_CART_ID;

export const loadCartPage = async (request: Request, locale: Locale, copy: CartCopy): Promise<CartPageModel | null> => {
	const origin = new URL(request.url).origin;
	const cart = await fetchCartServer(request);
	if (!cart) return null;
	if (cart.lines.length === 0) {
		return cartPageOf(cart, locale, copy, new Map(), new Map());
	}
	const items = await catalogForProducts(
		origin,
		cart.lines.map((line) => line.productId),
	);
	const slugByProductId = new Map(items.map((item) => [item.id, item.slug]));
	const imageByPriceId = await lineImages(origin, cart, items);
	return cartPageOf(cart, locale, copy, slugByProductId, imageByPriceId);
};
