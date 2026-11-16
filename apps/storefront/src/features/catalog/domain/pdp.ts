import type { ProductDetailView } from "@emdash-commerce/plugin-stripe/contracts";

import { intlLocaleOf, type Locale } from "../../../lib/i18n";

/** The delivery window shown on the product page, in business days from the order (matches the FAQ copy: 3 to 5). */
export const DELIVERY_BUSINESS_DAYS = { min: 3, max: 5 } as const;

/** Specification labels (any locale, lower case) that carry the parts of a bundle as one comma-separated line. */
const INCLUDES_LABELS: readonly string[] = ["includes", "zawiera", "w zestawie"];

/**
 * The saving a bundle's description states, as two amounts around "instead of" ("$109 instead of $147", "109 zł zamiast
 * 147 zł"). The page shows exactly that phrase as a chip, so the description is a contract: the catalog data
 * (`scripts/lib/merch-catalog.mjs`) and its test keep to this wording, and a description without it shows no chip.
 */
const AMOUNT = String.raw`[$€£]?\d[\d.,]*(?:\s?(?:zł|PLN|USD|EUR|GBP))?`;
const SAVING_PATTERN = new RegExp(`(${AMOUNT})\\s+(instead of|zamiast)\\s+(${AMOUNT})`, "i");

export interface BundleView {
	items: string[];
	saving: string | null;
}

const isWeekend = (date: Date): boolean => date.getUTCDay() === 0 || date.getUTCDay() === 6;

/** The date `days` business days after `from` (weekends skipped), in UTC so the result never depends on the server's zone. */
export const addBusinessDays = (from: Date, days: number): Date => {
	const result = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
	let remaining = days;
	while (remaining > 0) {
		result.setUTCDate(result.getUTCDate() + 1);
		if (!isWeekend(result)) remaining -= 1;
	}
	return result;
};

/** "Tue, Nov 18 – Thu, Nov 20": the concrete range the parcel arrives in. */
export const deliveryRange = (from: Date, locale: Locale, window = DELIVERY_BUSINESS_DAYS): string => {
	const formatter = new Intl.DateTimeFormat(intlLocaleOf(locale), {
		weekday: "short",
		day: "numeric",
		month: "short",
		timeZone: "UTC",
	});
	return `${formatter.format(addBusinessDays(from, window.min))} – ${formatter.format(addBusinessDays(from, window.max))}`;
};

const splitParts = (line: string): string[] =>
	line
		.split(/,|;/)
		.map((part) => part.trim())
		.filter((part) => part.length > 0);

const withoutTrailingPunctuation = (amount: string): string => amount.replace(/[.,]+$/, "");

const savingOf = (description: ProductDetailView["description"]): string | null => {
	for (const block of description ?? []) {
		const children = (block as { children?: { text?: string }[] }).children;
		const text = Array.isArray(children) ? children.map((child) => child.text ?? "").join("") : "";
		const match = SAVING_PATTERN.exec(text);
		if (match) return `${withoutTrailingPunctuation(match[1]!)} ${match[2]!} ${withoutTrailingPunctuation(match[3]!)}`;
	}
	return null;
};

/** The parts and the saving of a bundle: read from its "Includes" specification line and the description. */
export const bundleOf = (specs: ProductDetailView["specs"], description: ProductDetailView["description"]): BundleView | null => {
	const row = specs.find((spec) => INCLUDES_LABELS.includes(spec.label.trim().toLowerCase()));
	if (!row) return null;
	const items = splitParts(row.value);
	if (items.length === 0) return null;
	return { items, saving: savingOf(description) };
};

/** The specification rows without the bundle's "Includes" line (it has its own list next to the buy button). */
export const specsWithoutIncludes = (specs: ProductDetailView["specs"]): ProductDetailView["specs"] =>
	specs.filter((spec) => !INCLUDES_LABELS.includes(spec.label.trim().toLowerCase()));
