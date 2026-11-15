import type { Address } from "../../../core/customer.js";

/**
 * Typed readers over `ContentItem.data`. Verified in emdash/src/database/repositories/content.ts
 * (mapRow, deserializeValue, serializeValue): a NULL column is omitted from `data`; booleans live in an
 * INTEGER column and come back as 0/1; JSON columns come back parsed; a `string` value that starts with
 * `{` or `[` is JSON-parsed on read, so free text is never stored in a JSON-looking string field.
 */

export type Data = Record<string, unknown>;

/**
 * The part of a plugin `ContentItem` the mappers read. Declared here because `emdash` exports two
 * different `ContentItem` types (the repository's and the plugin API's); this one fits both structurally.
 */
export interface ContentEntry {
	id: string;
	slug: string | null;
	status: string;
	data: Data;
	createdAt: string;
	updatedAt: string;
}

export const asString = (value: unknown): string | null => (typeof value === "string" && value.length > 0 ? value : null);

export const asInt = (value: unknown): number | null => {
	if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
	if (typeof value === "string" && /^-?\d+$/.test(value)) return Number.parseInt(value, 10);
	return null;
};

export const asBool = (value: unknown, fallback = false): boolean => {
	if (value === true || value === 1 || value === "1" || value === "true") return true;
	if (value === false || value === 0 || value === "0" || value === "false") return false;
	return fallback;
};

export const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

export const asRecord = (value: unknown): Record<string, unknown> | null =>
	typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

/** A column-backed reference holds the linked entry id as text (the admin may also hand over `{ id }`). */
export const asRefId = (value: unknown): string | null => asString(value) ?? asString(asRecord(value)?.id);

export const asAddress = (value: unknown): Address | null => {
	const record = asRecord(value);
	if (!record) return null;
	return {
		line1: asString(record.line1),
		line2: asString(record.line2),
		city: asString(record.city),
		postalCode: asString(record.postalCode),
		state: asString(record.state),
		country: asString(record.country),
	};
};

export const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
	typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;

export const oneOfOrNull = <T extends string>(value: unknown, allowed: readonly T[]): T | null =>
	typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null;

/** `undefined` entries are dropped (field not part of the write); `null` clears the field. */
export const compact = (data: Record<string, unknown>): Record<string, unknown> =>
	Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));

