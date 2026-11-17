import { PRICE_TYPE, type Price } from "./catalog.js";

/**
 * The one rule that picks the price a sellable (a simple product, or one variant) is offered at by default, for the
 * storefront read API and for anything that needs "the" price of a sellable. Candidates are the prices linked to that
 * sellable; the first rule that matches wins:
 *
 * 1. an active, explicitly default price an editor added (`isDefault` and not managed), e.g. a subscription plan;
 * 2. the active managed price (it mirrors the product / variant `price` field);
 * 3. the cheapest active one-time price, then the cheapest active price of any kind (a legacy price entered by hand);
 * 4. none.
 *
 * Ties break by id so the choice is stable. Inactive prices never win.
 */
export const selectDefaultPrice = <T extends Pick<Price, "id" | "isActive" | "isDefault" | "isManaged" | "type" | "unitAmount">>(prices: readonly T[]): T | null => {
	const active = prices.filter((price) => price.isActive);
	const cheapest = (list: readonly T[]): T | null => [...list].sort((a, b) => a.unitAmount - b.unitAmount || a.id.localeCompare(b.id))[0] ?? null;
	const byId = (list: readonly T[]): T | null => [...list].sort((a, b) => a.id.localeCompare(b.id))[0] ?? null;
	return (
		byId(active.filter((price) => price.isDefault && !price.isManaged)) ??
		byId(active.filter((price) => price.isManaged)) ??
		cheapest(active.filter((price) => price.type === PRICE_TYPE.oneTime)) ??
		cheapest(active)
	);
};
