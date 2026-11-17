import type { CommerceOptions } from "../../contracts/options.js";
import { swatchProblem } from "../../core/catalog-rules.js";
import { ATTRIBUTE_VALUE_FIELD, PRODUCT_FIELD, VARIANT_FIELD } from "../../adapters/emdash/schema/field-names.js";
import { asInt } from "../../adapters/emdash/content/values.js";

/**
 * Field-level checks that run in `content:beforeSave`, where the hook sees the submitted field values (and none of
 * the relation selections): a swatch colour must be `#rgb` / `#rrggbb`; a price and a price override must be a
 * non-negative whole number of minor units. Returns readable sentences (empty = fine). Only fields present in the
 * save are checked (a partial update leaves the rest alone).
 */
export const catalogSaveProblems = (slugs: CommerceOptions["collections"], collection: string, content: Record<string, unknown>): string[] => {
	const problems: string[] = [];
	const amountProblem = (field: string, label: string): void => {
		if (!Object.hasOwn(content, field)) return;
		const raw = content[field];
		if (raw === undefined || raw === null || raw === "") return;
		const amount = asInt(raw);
		if (amount === null || amount < 0 || (typeof raw === "number" && !Number.isInteger(raw))) {
			problems.push(`${label} must be a whole number of minor units, zero or more (got "${String(raw)}").`);
		}
	};

	if (collection === slugs.attributeValues && Object.hasOwn(content, ATTRIBUTE_VALUE_FIELD.swatch)) {
		const problem = swatchProblem(content[ATTRIBUTE_VALUE_FIELD.swatch]);
		if (problem) problems.push(problem);
	}
	if (collection === slugs.products) amountProblem(PRODUCT_FIELD.price, "The product price");
	if (collection === slugs.variants) amountProblem(VARIANT_FIELD.price, "The variant price");
	return problems;
};
