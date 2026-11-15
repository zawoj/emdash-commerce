import { RELATIONS_PAGE_SIZE } from "../../adapters/emdash/relations/port.js";
import { asBool, asInt, asString } from "../../adapters/emdash/content/values.js";
import { PRICE_FIELD, PRODUCT_FIELD, VARIANT_FIELD } from "../../adapters/emdash/schema/field-names.js";
import { PRICE_TYPE, TAX_BEHAVIOR, type Product, type Variant } from "../../core/catalog.js";
import { requireContent, type CommerceContainer } from "../../plugin/container.js";
import { LOCK_KEY, withLock } from "../locks.js";
import type { CatalogEntityRef } from "../contracts.js";

/**
 * Hybrid prices: the product `price` and a variant's `price` override are mirrored into one `prices` entry per
 * sellable (`is_managed`), so cart, checkout and catalog sync keep a single price model. This module owns those
 * entries; editors never edit them (the protected-field guard refuses it).
 *
 * - A simple product: one managed entry, amount = the product price.
 * - A product with variants: one managed entry per variant, amount = the variant override, else the product price.
 *   The product itself carries none.
 * - An inactive variant has no managed price: the entry is archived (`is_active` false) and restored when the variant
 *   is activated again.
 * - No amount (price cleared, or no price anywhere) archives the entry (`is_active` false); it is kept so a later
 *   price reuses it instead of piling up entries.
 * - The entry is created once and then updated: found by relation + `is_managed`, so replaying a hook, saving twice
 *   or two saves racing (serialised by one lock per product tree) never produce a second entry. Should a stray
 *   duplicate exist, one entry stays and the others are archived.
 * - The write goes through content / `RelationsPort`, which fire no hooks; the caller runs the Stripe sync after
 *   (an amount change makes the sync create a new Stripe price and archive the old one, see sync-price.ts).
 */

export const MANAGED_PRICE_NICKNAME = "Base price";

export const MANAGED_CHANGE = {
	created: "created",
	updated: "updated",
	archived: "archived",
} as const;
export type ManagedChangeKind = (typeof MANAGED_CHANGE)[keyof typeof MANAGED_CHANGE];

export interface ManagedPriceChange {
	priceId: string;
	kind: ManagedChangeKind;
}

interface Sellable {
	kind: "product" | "variant";
	id: string;
	/** Desired amount in minor units; null = no managed price. */
	amount: number | null;
}

/** The amount a variant sells at by default: its override, else the product price. */
export const variantAmountOf = (product: Pick<Product, "price">, variant: Pick<Variant, "price">): number | null => variant.price ?? product.price;

/** What the managed entry of a variant mirrors: nothing while the variant is inactive (so the entry is archived), else its amount. */
const managedAmountOfVariant = (product: Pick<Product, "price">, variant: Pick<Variant, "price" | "isActive">): number | null =>
	variant.isActive ? variantAmountOf(product, variant) : null;

const sellablesOf = (product: Product, variants: readonly Variant[]): Sellable[] =>
	product.hasVariants
		? [{ kind: "product", id: product.id, amount: null }, ...variants.map((variant): Sellable => ({ kind: "variant", id: variant.id, amount: managedAmountOfVariant(product, variant) }))]
		: [{ kind: "product", id: product.id, amount: product.price }];

/**
 * Brings the managed price entries of the sellables `ref` touches to what the product / variant prices say: a product
 * covers its whole tree, a variant only itself. Returns what changed (nothing when already converged).
 */
export const syncManagedPrices = async (container: CommerceContainer, ref: CatalogEntityRef): Promise<ManagedPriceChange[]> => {
	if (ref.entity === "price") return [];
	const productId = ref.entity === "product" ? ref.id : ((await container.catalog.getVariant(ref.id))?.productId ?? null);
	if (!productId) return [];
	return withLock(container, LOCK_KEY.managedPrices(productId), async () => {
		const product = await container.catalog.getProduct(productId);
		if (!product) return [];
		const variants = product.hasVariants ? await container.catalog.listVariants(productId) : [];
		const all = sellablesOf(product, variants);
		const wanted = ref.entity === "variant" ? all.filter((sellable) => sellable.kind === "variant" && sellable.id === ref.id) : all;
		const changes: ManagedPriceChange[] = [];
		for (const sellable of wanted) changes.push(...(await reconcileSellable(container, sellable)));
		return changes;
	});
};

interface ManagedEntry {
	id: string;
	isActive: boolean;
	amount: number | null;
	currency: string | null;
	isOneTime: boolean;
}

const linkField = (sellable: Sellable) => (sellable.kind === "product" ? PRICE_FIELD.product : PRICE_FIELD.variant);

const managedEntriesOf = async (container: CommerceContainer, sellable: Sellable): Promise<ManagedEntry[]> => {
	const slugs = container.options.collections;
	const content = requireContent(container);
	const owner = sellable.kind === "product" ? slugs.products : slugs.variants;
	const field = sellable.kind === "product" ? PRODUCT_FIELD.prices : VARIANT_FIELD.prices;
	const page = await container.relations.children(owner, sellable.id, field, { includeDrafts: true, limit: RELATIONS_PAGE_SIZE });
	const entries: ManagedEntry[] = [];
	for (const link of page.items) {
		const item = await content.get(slugs.prices, link.id);
		if (!item || !asBool(item.data[PRICE_FIELD.isManaged])) continue;
		entries.push({
			id: item.id,
			isActive: asBool(item.data[PRICE_FIELD.isActive], true),
			amount: asInt(item.data[PRICE_FIELD.unitAmount]),
			currency: asString(item.data[PRICE_FIELD.currency]),
			isOneTime: (asString(item.data[PRICE_FIELD.type]) ?? PRICE_TYPE.oneTime) === PRICE_TYPE.oneTime,
		});
	}
	// The entry that stays: an active one first, then the lowest id (stable across replays).
	return entries.sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.id.localeCompare(b.id));
};

const reconcileSellable = async (container: CommerceContainer, sellable: Sellable): Promise<ManagedPriceChange[]> => {
	const slugs = container.options.collections;
	const content = requireContent(container);
	const [keeper, ...strays] = await managedEntriesOf(container, sellable);
	const changes: ManagedPriceChange[] = [];
	for (const stray of strays) {
		if (!stray.isActive) continue;
		await content.update(slugs.prices, stray.id, { [PRICE_FIELD.isActive]: false });
		changes.push({ priceId: stray.id, kind: MANAGED_CHANGE.archived });
	}

	if (sellable.amount === null) {
		if (keeper?.isActive) {
			await content.update(slugs.prices, keeper.id, { [PRICE_FIELD.isActive]: false });
			changes.push({ priceId: keeper.id, kind: MANAGED_CHANGE.archived });
		}
		return changes;
	}

	const currency = container.options.supportedCurrencies[0]!;
	const desired = {
		[PRICE_FIELD.type]: PRICE_TYPE.oneTime,
		[PRICE_FIELD.unitAmount]: sellable.amount,
		[PRICE_FIELD.currency]: currency,
		[PRICE_FIELD.isActive]: true,
		[PRICE_FIELD.isDefault]: true,
	};
	if (!keeper) {
		const created = await container.relations.createWithReferences(
			slugs.prices,
			{ data: { ...desired, [PRICE_FIELD.nickname]: MANAGED_PRICE_NICKNAME, [PRICE_FIELD.taxBehavior]: TAX_BEHAVIOR.unspecified, [PRICE_FIELD.isManaged]: true }, status: "published" },
			{ [linkField(sellable)]: [sellable.id] },
		);
		changes.push({ priceId: created.id, kind: MANAGED_CHANGE.created });
		return changes;
	}
	const isCurrent = keeper.isActive && keeper.amount === sellable.amount && keeper.currency === currency && keeper.isOneTime;
	if (!isCurrent) {
		await content.update(slugs.prices, keeper.id, desired);
		changes.push({ priceId: keeper.id, kind: MANAGED_CHANGE.updated });
	}
	return changes;
};
