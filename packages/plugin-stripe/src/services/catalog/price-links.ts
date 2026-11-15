import { PRICE_FIELD } from "../../adapters/emdash/schema/field-names.js";
import { asString } from "../../adapters/emdash/content/values.js";
import { requireContent, type CommerceContainer } from "../../plugin/container.js";

export const PRICE_LINK_PROBLEM = "Link the price to a product or to a variant: exactly one of the two.";

/**
 * A price belongs to exactly one sellable: the product or one of its variants. The relation selections are not
 * visible to `content:beforeSave`, so this runs after the save: an invalid price is marked failed (its sync error says
 * why, visible in the price's editor) and never sent to Stripe. Returns true when the links are valid.
 */
export const checkPriceLinks = async (container: CommerceContainer, priceId: string): Promise<boolean> => {
	const slugs = container.options.collections;
	const fields = await container.relations.fields(slugs.prices, priceId, [PRICE_FIELD.product, PRICE_FIELD.variant], { includeDrafts: true, limit: 2 });
	const linked = fields[PRICE_FIELD.product]!.items.length + fields[PRICE_FIELD.variant]!.items.length;
	if (linked === 1) return true;
	const price = await requireContent(container).get(slugs.prices, priceId);
	await container.catalogMirror.writePriceSync(priceId, {
		stripePriceId: asString(price?.data[PRICE_FIELD.stripePriceId]),
		stripeSyncStatus: "failed",
		stripeSyncError: PRICE_LINK_PROBLEM,
	});
	return false;
};
