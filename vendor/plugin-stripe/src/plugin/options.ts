import { commerceOptionsSchema, type CommerceOptions } from "../contracts/options.js";

/** Parses plugin options and fails fast with a readable message (the plugin cannot start on bad options). */
export const parseCommerceOptions = (raw: unknown): CommerceOptions => {
	const parsed = commerceOptionsSchema.safeParse(raw ?? {});
	if (parsed.success) return parsed.data;
	const lines = parsed.error.issues.map((issue) => `  - ${issue.path.length > 0 ? issue.path.join(".") : "(options)"}: ${issue.message}`);
	throw new Error(`Invalid stripe-commerce plugin options:\n${lines.join("\n")}`);
};
