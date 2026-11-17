import { OPTION_FIELD_PREFIX } from "./constants";
import type { VariantRow } from "./variants";

const axisOf = (field: string): string | undefined =>
	field.startsWith(OPTION_FIELD_PREFIX) && field.length > OPTION_FIELD_PREFIX.length
		? field.slice(OPTION_FIELD_PREFIX.length)
		: undefined;

export const chosenOptions = (values: Readonly<Record<string, unknown>>): Record<string, string> => {
	const chosen: Record<string, string> = {};
	for (const [field, value] of Object.entries(values)) {
		const axis = axisOf(field);
		const code = Array.isArray(value) ? value[0] : value;
		if (axis && typeof code === "string" && code.trim() !== "") chosen[axis] = code.trim();
	}
	return chosen;
};

export const resolveVariantRow = (
	rows: readonly VariantRow[],
	values: Readonly<Record<string, unknown>>,
): VariantRow | undefined => {
	const chosen = chosenOptions(values);
	const matches = rows.filter((row) =>
		Object.entries(row.options).every(([axis, code]) => chosen[axis] === code),
	);
	return matches.length === 1 ? matches[0] : undefined;
};
