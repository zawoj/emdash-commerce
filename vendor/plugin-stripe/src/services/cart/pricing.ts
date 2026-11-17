import type { ExtensionContext } from "../../contracts/extensions.js";
import { CART_STATUS, type Cart, type PricedCart } from "../../core/cart.js";
import { priceTermsFingerprint, sellableKey, sellableOfPrice, type Price, type Product, type Variant } from "../../core/catalog.js";
import { RESERVATION_STATUS, type ReservationLine } from "../../core/inventory.js";
import { priceCart, type PriceSyncLink } from "../../core/cart-pricing.js";
import type { CommerceContainer } from "../../plugin/container.js";
import { priceEntityKey } from "../catalog/entity-keys.js";

/** Marks a price that has no provider price yet but may get one (checkout runs the real sync). */
export const PENDING_PROVIDER_PRICE = "pending";

const unique = <T>(values: Iterable<T>): T[] => [...new Set(values)];

const fetchMap = async <T extends object>(ids: readonly string[], load: (id: string) => Promise<T | null>): Promise<Map<string, T>> => {
	const found = new Map<string, T>();
	await Promise.all(
		ids.map(async (id) => {
			const record = await load(id);
			if (record) found.set(id, record);
		}),
	);
	return found;
};

/**
 * Sync links for pricing without calling the provider: a price counts as sellable when it is synced for
 * its current terms, or has not failed (pending, or terms changed and a re-sync is queued). Only a
 * `failed` link blocks, so a freshly published product is not stuck behind an unfinished background sync;
 * checkout resolves the real provider price and rejects what still cannot be sold.
 */
export const loadSyncLinks = async (container: CommerceContainer, prices: ReadonlyMap<string, Price>): Promise<Map<string, PriceSyncLink>> => {
	const links = new Map<string, PriceSyncLink>();
	await Promise.all(
		[...prices.values()].map(async (price) => {
			const found = await container.catalogLinks.get(priceEntityKey(price.id));
			const fingerprint = priceTermsFingerprint(price);
			const known = found?.value.providerPriceByFingerprint[fingerprint];
			if (known) links.set(price.id, { providerPriceByFingerprint: { [fingerprint]: known } });
			else if (found?.value.syncStatus !== "failed") links.set(price.id, { providerPriceByFingerprint: { [fingerprint]: PENDING_PROVIDER_PRICE } });
		}),
	);
	return links;
};

const linksFromProvider = (prices: ReadonlyMap<string, Price>, resolved: ReadonlyMap<string, string | null>): Map<string, PriceSyncLink> => {
	const links = new Map<string, PriceSyncLink>();
	for (const price of prices.values()) {
		const providerPriceId = resolved.get(price.id);
		if (providerPriceId) links.set(price.id, { providerPriceByFingerprint: { [priceTermsFingerprint(price)]: providerPriceId } });
	}
	return links;
};

/** Units held for this cart by its open checkout, so the cart does not compete with itself for stock. */
const ownReservationOf = async (container: CommerceContainer, cart: Cart): Promise<ReservationLine[] | undefined> => {
	const checkout = cart.checkout;
	if (cart.status !== CART_STATUS.checkoutOpen || !checkout?.reservationId) return undefined;
	if (checkout.expiresAt <= container.clock.now().toISOString()) return undefined;
	const reservation = await container.inventory.getReservation(checkout.reservationId);
	return reservation?.status === RESERVATION_STATUS.held ? reservation.lines : undefined;
};

export interface LoadedCatalog {
	prices: Map<string, Price>;
	products: Map<string, Product>;
	variants: Map<string, Variant>;
}

export const loadCatalogFor = async (container: CommerceContainer, priceIds: readonly string[]): Promise<LoadedCatalog> => {
	const prices = await container.catalog.getPrices(unique(priceIds));
	const [products, variants] = await Promise.all([
		fetchMap(unique([...prices.values()].map((price) => price.productId)), (id) => container.catalog.getProduct(id)),
		fetchMap(unique([...prices.values()].flatMap((price) => (price.variantId ? [price.variantId] : []))), (id) => container.catalog.getVariant(id)),
	]);
	return { prices, products, variants };
};

export interface PricingOverrides {
	/** Result of `ensurePricesSynced`; when set it replaces the stored sync state (checkout). */
	providerPrices?: ReadonlyMap<string, string | null>;
}

/**
 * Loads catalog, stock and sync state for a cart and prices it, then adds the site's `validateCart`
 * issues. A failing extension fails the request (it is part of the decision, see contracts/extensions.ts).
 */
export const loadPricedCart = async (
	container: CommerceContainer,
	extensionContext: ExtensionContext,
	cart: Cart,
	overrides: PricingOverrides = {},
): Promise<PricedCart> => {
	const { prices, products, variants } = await loadCatalogFor(container, cart.lines.map((line) => line.priceId));
	const sellables = [...new Map([...prices.values()].map((price) => [sellableKey(sellableOfPrice(price)), sellableOfPrice(price)])).values()];
	const [stock, catalogLinks, ownReservation] = await Promise.all([
		container.inventory.getMany(sellables),
		overrides.providerPrices ? Promise.resolve(linksFromProvider(prices, overrides.providerPrices)) : loadSyncLinks(container, prices),
		ownReservationOf(container, cart),
	]);
	const { maxLines, maxQuantityPerLine } = container.options.cart;
	const priced = priceCart({
		cart,
		prices,
		products,
		variants,
		stock,
		catalogLinks,
		options: { maxLines, maxQuantityPerLine, supportedCurrencies: container.options.supportedCurrencies },
		...(ownReservation ? { ownReservation } : {}),
	});
	const validate = container.extensions.validateCart;
	if (!validate) return priced;
	const extra = await validate(priced, extensionContext);
	if (extra.length === 0) return priced;
	const issues = [...priced.issues, ...extra];
	return { ...priced, issues, isCheckoutReady: false };
};
