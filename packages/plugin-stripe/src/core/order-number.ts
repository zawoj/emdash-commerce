/**
 * Human-readable, sequential order numbers. The format is a template with three tokens:
 * - `{PREFIX}`  the `orders.numberPrefix` option, upper-cased and stripped to `A-Z0-9` (`ORD` when it is empty);
 * - `{YYYY}`    the UTC year the order was placed;
 * - `{seq:N}`   the per-year counter, zero-padded to N digits (1-9); exactly one is required.
 * The default `{PREFIX}-{YYYY}-{seq:5}` yields `ORD-2026-00042`. The counter itself is allocated by the
 * `OrderRepository` (`nextSequence`), once per order, so numbers never repeat.
 */

export const DEFAULT_ORDER_NUMBER_FORMAT = "{PREFIX}-{YYYY}-{seq:5}" as const;

const SEQ_TOKEN = /\{seq:(\d)\}/g;
const TOKEN = /\{[^}]*\}/g;
const LITERAL = /^[A-Za-z0-9 _./#-]*$/;
const MAX_SEQUENCE_DIGITS = 9;

export const normalisePrefix = (prefix: string): string => prefix.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") || "ORD";

/** Returns what is wrong with a format, or null when it is usable. */
export const validateOrderNumberFormat = (format: string): string | null => {
	const seqTokens = [...format.matchAll(SEQ_TOKEN)];
	if (seqTokens.length !== 1) return "The format needs exactly one {seq:N} token";
	const digits = Number(seqTokens[0]![1]);
	if (digits < 1 || digits > MAX_SEQUENCE_DIGITS) return `{seq:N} takes N from 1 to ${MAX_SEQUENCE_DIGITS}`;
	const unknown = (format.match(TOKEN) ?? []).filter((token) => token !== "{PREFIX}" && token !== "{YYYY}" && !/^\{seq:\d\}$/.test(token));
	if (unknown.length > 0) return `Unknown token ${unknown[0]}; use {PREFIX}, {YYYY} and {seq:N}`;
	if (!LITERAL.test(format.replace(TOKEN, ""))) return "The format may only contain letters, digits and - _ . / # between the tokens";
	if (format.length > 40) return "The format may be at most 40 characters";
	return null;
};

export interface OrderNumberInput {
	format: string;
	prefix: string;
	placedAt: Date;
	sequence: number;
}

export const formatOrderNumber = (input: OrderNumberInput): string =>
	input.format
		.replaceAll("{PREFIX}", normalisePrefix(input.prefix))
		.replaceAll("{YYYY}", String(input.placedAt.getUTCFullYear()))
		.replace(SEQ_TOKEN, (_token, digits: string) => String(input.sequence).padStart(Number(digits), "0"));
