import type { CommerceOptions } from "../../../contracts/options.js";
import type { CollectionDefinition } from "./collections.js";
import { ORDER_FIELD, PRICE_FIELD } from "./field-names.js";

/**
 * Which fields editors may not change. Everything the provider drives (Stripe ids and sync state,
 * statuses, money, lines) is read-only: the plugin writes it through `ctx.content.update`, which
 * fires no hooks, so the `content:beforeSave` guard (guard.ts) only ever sees editor and API saves.
 *
 * - Catalog collections: editors own editorial fields; variant `stock` is editable (inventory delta sync).
 *   Variants and prices: every `stripe_*` field is protected, and so is any field a definition marks `isProtected`
 *   (the derived `options_key`, the product `specs` snapshot, the price `is_managed` flag). Products carry no
 *   plugin-written Stripe mirrors (revisions would stage drafts — emdash database/repositories/content.ts ~1395-1420).
 * - Plugin-owned collections (orders, payments, subscriptions, customers, carts): everything is protected
 *   except the fields listed in `EDITABLE_ORDER_FIELDS`, and editors cannot create entries at all.
 */

export const EDITABLE_ORDER_FIELDS: readonly string[] = [ORDER_FIELD.notes];

export interface CollectionPolicy {
	slug: string;
	label: string;
	/** True for collections only the plugin may create. */
	isCreationLocked: boolean;
	protectedFields: readonly string[];
	/**
	 * Fields that are read-only only on an entry whose `flagField` is set (the plugin-managed price entry mirrors the
	 * product / variant price, so its terms are not editable there while a hand-made price stays editable).
	 */
	managedLock?: { flagField: string; lockedFields: readonly string[]; message: string };
}

/** The money and activation fields of a managed price entry. */
export const MANAGED_PRICE_LOCKED_FIELDS: readonly string[] = [
	PRICE_FIELD.type,
	PRICE_FIELD.unitAmount,
	PRICE_FIELD.currency,
	PRICE_FIELD.interval,
	PRICE_FIELD.intervalCount,
	PRICE_FIELD.trialDays,
	PRICE_FIELD.isActive,
];

const STRIPE_FIELD_PREFIX = "stripe_";

export const buildCollectionPolicies = (
	definitions: readonly CollectionDefinition[],
	slugs: CommerceOptions["collections"],
): Record<string, CollectionPolicy> =>
	Object.fromEntries(
		definitions.map((definition) => {
			const editable = definition.slug === slugs.orders ? EDITABLE_ORDER_FIELDS : [];
			const protectedFields = definition.isPluginOwned
				? definition.fields.map((field) => field.slug).filter((slug) => !editable.includes(slug))
				: definition.fields.filter((field) => field.isProtected || field.slug.startsWith(STRIPE_FIELD_PREFIX)).map((field) => field.slug);
			const policy: CollectionPolicy = {
				slug: definition.slug,
				label: definition.label,
				isCreationLocked: definition.isPluginOwned,
				protectedFields,
				...(definition.slug === slugs.prices
					? {
							managedLock: {
								flagField: PRICE_FIELD.isManaged,
								lockedFields: MANAGED_PRICE_LOCKED_FIELDS,
								message: "This price is managed by the commerce plugin: it mirrors the price of the product or variant. Change the price there, or add an extra price for a subscription or another currency.",
							},
						}
					: {}),
			};
			return [definition.slug, policy];
		}),
	);
