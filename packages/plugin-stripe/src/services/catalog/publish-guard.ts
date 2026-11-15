import { PRODUCT_FIELD } from "../../adapters/emdash/schema/field-names.js";
import { asBool, asString } from "../../adapters/emdash/content/values.js";
import { missingRequiredSpecs, optionsKeyOf, productTypeProblems, variantValueProblems } from "../../core/catalog-rules.js";
import { isCommerceError } from "../../core/errors.js";
import type { Attribute } from "../../core/product-type.js";
import type { CommerceContainer } from "../../plugin/container.js";
import { specsOfData, titleOfData } from "./editor-read.js";

/** EmDash accepts a cancel reason of at most 500 code points and no control characters. */
const MAX_REASON_LENGTH = 480;

const loadAttributes = async (container: CommerceContainer, ids: readonly string[]): Promise<Attribute[]> => {
	const found = await Promise.all(ids.map((id) => container.catalog.getAttribute(id)));
	return found.filter((attribute): attribute is Attribute => attribute !== null);
};

/**
 * Everything that keeps a product from being published, as readable sentences (empty = publishable). `data` is the
 * draft the editor is publishing (the policy event carries it merged); links are read with `includeDrafts: true`, which
 * returns the selection still staged in the draft. Checks that need relation data live here and not in
 * `content:beforeSave`, because the host gives that hook the field values only, never the picker selections.
 */
export const productPublishProblems = async (container: CommerceContainer, productId: string, data: Record<string, unknown>): Promise<string[]> => {
	const problems: string[] = [];
	const productFields = await container.relations.fields(container.options.collections.products, productId, [PRODUCT_FIELD.productType], { includeDrafts: true, limit: 1 });
	const typeId = productFields[PRODUCT_FIELD.productType]!.items[0]?.id ?? null;
	const type = typeId ? await container.catalog.getProductType(typeId) : null;
	const axes = type ? await loadAttributes(container, type.variantAxisIds) : [];

	if (type) {
		problems.push(...productTypeProblems(type, axes));
		const required = await loadAttributes(container, type.requiredSpecIds);
		const nameOf = (id: string): string => required.find((attribute) => attribute.id === id)?.name ?? id;
		const missing = missingRequiredSpecs(type, specsOfData(data), nameOf);
		if (missing.length > 0) problems.push(`Fill the required specification${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.`);
	}

	if (!asBool(data[PRODUCT_FIELD.hasVariants])) {
		if (!asString(data[PRODUCT_FIELD.sku])?.trim()) problems.push("Add a SKU: a product without variants needs one.");
		return problems;
	}

	let variants: Awaited<ReturnType<CommerceContainer["catalog"]["listVariants"]>> = [];
	try {
		variants = await container.catalog.listVariants(productId);
	} catch (error) {
		if (!isCommerceError(error)) throw error;
		problems.push(error.message);
		return problems;
	}
	if (!variants.some((variant) => variant.isActive)) problems.push("Add at least one active variant: a product with variants cannot be sold without one.");

	const byKey = new Map<string, string[]>();
	for (const variant of variants) {
		if (type) {
			for (const problem of variantValueProblems(type, axes, variant.optionValueIds)) problems.push(`Variant "${variant.title}": ${problem}`);
		}
		if (variant.optionValueIds.length === 0) continue;
		const key = optionsKeyOf(variant.optionValueIds);
		byKey.set(key, [...(byKey.get(key) ?? []), variant.title]);
	}
	for (const titles of byKey.values()) {
		if (titles.length > 1) problems.push(`Variants ${titles.map((title) => `"${title}"`).join(" and ")} have the same options.`);
	}
	return problems;
};

/** The message shown for a refused publish, or null when the product may go live. */
export const productPublishRefusal = async (container: CommerceContainer, content: Record<string, unknown>): Promise<string | null> => {
	const id = typeof content.id === "string" ? content.id : null;
	if (!id) return null;
	const data = typeof content.data === "object" && content.data !== null && !Array.isArray(content.data) ? (content.data as Record<string, unknown>) : {};
	const problems = await productPublishProblems(container, id, data);
	if (problems.length === 0) return null;
	const title = titleOfData(data);
	const message = `Cannot publish${title ? ` "${title}"` : ""}: ${problems.join(" ")}`.replace(/\s+/g, " ");
	return message.length > MAX_REASON_LENGTH ? `${message.slice(0, MAX_REASON_LENGTH - 1)}…` : message;
};
