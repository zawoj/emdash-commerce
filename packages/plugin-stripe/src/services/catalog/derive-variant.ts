import { optionsKeyOf, variantSkuOf, variantTitleOf } from "../../core/catalog-rules.js";
import { RELATIONS_PAGE_SIZE } from "../../adapters/emdash/relations/port.js";
import { asString, compact } from "../../adapters/emdash/content/values.js";
import { PRODUCT_FIELD, VARIANT_FIELD } from "../../adapters/emdash/schema/field-names.js";
import { requireContent, type CommerceContainer } from "../../plugin/container.js";

/**
 * After an editor saves a variant: the derived fields follow its links. `options_key` is the sorted value ids; an
 * empty title becomes `Product — M / Black`; an empty SKU becomes `PRODUCT-SKU-M-BLK`. Only a field that differs is
 * written (the write fires no hooks, so this cannot loop). The relation selections are not visible to
 * `content:beforeSave`, which is why this runs after the save.
 */
export const deriveVariantFields = async (container: CommerceContainer, variantId: string): Promise<void> => {
	const { relations, catalog } = container;
	const content = requireContent(container);
	const slugs = container.options.collections;
	const variant = await content.get(slugs.variants, variantId);
	if (!variant) return;
	const fields = await relations.fields(slugs.variants, variantId, [VARIANT_FIELD.product, VARIANT_FIELD.optionValues], { includeDrafts: true, limit: RELATIONS_PAGE_SIZE });
	const productId = fields[VARIANT_FIELD.product]!.items[0]?.id ?? null;
	const valueIds = fields[VARIANT_FIELD.optionValues]!.items.map((entry) => entry.id);

	const key = optionsKeyOf(valueIds);
	const patch: Record<string, unknown> = {};
	if ((asString(variant.data[VARIANT_FIELD.optionsKey]) ?? "") !== key) patch[VARIANT_FIELD.optionsKey] = key;

	const needsTitle = !asString(variant.data[VARIANT_FIELD.title]);
	const needsSku = !asString(variant.data[VARIANT_FIELD.sku]);
	if (productId && (needsTitle || needsSku)) {
		const product = await content.get(slugs.products, productId);
		const values = [...(await catalog.getAttributeValues(valueIds)).values()];
		const ordered = valueIds.map((id) => values.find((value) => value.id === id)).filter((value): value is NonNullable<typeof value> => value !== undefined);
		if (needsTitle && product) patch[VARIANT_FIELD.title] = variantTitleOf(asString(product.data[PRODUCT_FIELD.title]) ?? "", ordered.map((value) => value.label));
		if (needsSku && product) {
			const sku = variantSkuOf(asString(product.data[PRODUCT_FIELD.sku]), product.slug ?? null, ordered.map((value) => value.code ?? value.label));
			if (sku) patch[VARIANT_FIELD.sku] = sku;
		}
	}
	const changes = compact(patch);
	if (Object.keys(changes).length > 0) await content.update(slugs.variants, variantId, changes);
};
