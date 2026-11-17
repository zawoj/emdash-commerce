import { currencyDecimals, isCurrencyCode } from "../../core/money.js";

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Every value that reaches an HTML email passes through here: names, titles and URLs are buyer- or editor-controlled. */
export const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);

/** `1999` + `pln` -> "19.99 PLN" (zero- and three-decimal currencies follow `currencyDecimals`). */
export const formatAmount = (amount: number, currency: string): string => {
	const code = currency.trim().toLowerCase();
	const decimals = isCurrencyCode(code) ? currencyDecimals(code) : 2;
	return `${(amount / 10 ** decimals).toFixed(decimals)} ${code.toUpperCase()}`;
};

/** A header or body line must not be able to inject another header: drop line breaks from single-line values. */
export const singleLine = (value: string): string => value.replace(/[\r\n]+/g, " ").trim();
