import { intlLocaleOf, type Locale } from "../../../lib/i18n";
import { DEFAULT_CURRENCY } from "../../../lib/money";
import { format } from "../../../lib/strings";
import type { CatalogCopy } from "../copy";
import { MINOR_PER_MAJOR, PRICE_PRESET_BREAKS } from "./constants";
import { priceRangeValue, type PriceRange } from "./params";

export interface PricePreset extends PriceRange {
	/** The `price` parameter value. */
	value: string;
}

const BREAKS_MINOR: readonly number[] = PRICE_PRESET_BREAKS.map((major) => major * MINOR_PER_MAJOR);

const presetOf = (min: number | null, max: number | null): PricePreset => ({
	min,
	max,
	value: priceRangeValue(min, max),
});

/**
 * The price choices after "Any": under the first break, between each pair, and from the last one up. A range
 * includes its lower break and stops one minor unit before the next, so no price sits in two of them.
 */
export const pricePresets = (): PricePreset[] => [
	presetOf(null, BREAKS_MINOR[0]! - 1),
	...BREAKS_MINOR.slice(1).map((upper, index) => presetOf(BREAKS_MINOR[index]!, upper - 1)),
	presetOf(BREAKS_MINOR[BREAKS_MINOR.length - 1]!, null),
];

export const isPreset = (min: number | null, max: number | null): boolean =>
	pricePresets().some((preset) => preset.min === min && preset.max === max);

/** A whole amount without decimals ("$25"), a fractional one with ("$25.50"), in the shop currency. */
export const formatWhole = (minor: number, locale: Locale, currency: string = DEFAULT_CURRENCY): string => {
	const isWhole = minor % MINOR_PER_MAJOR === 0;
	return new Intl.NumberFormat(intlLocaleOf(locale), {
		style: "currency",
		currency: currency.toUpperCase(),
		minimumFractionDigits: isWhole ? 0 : 2,
		maximumFractionDigits: isWhole ? 0 : 2,
	}).format(minor / MINOR_PER_MAJOR);
};

/** The label of a range: "Under $25", "$25–$50", "$100+"; a range of an old link reads "Up to $1" or "From $30". */
export const priceRangeLabel = (
	range: PriceRange,
	locale: Locale,
	copy: CatalogCopy,
	currency: string = DEFAULT_CURRENCY,
): string => {
	const { min, max } = range;
	const money = (minor: number) => formatWhole(minor, locale, currency);
	// The upper end of a preset is one unit below its break; shown as the break ("$25"), as shoppers read it.
	const upper = (value: number) => (BREAKS_MINOR.includes(value + 1) ? value + 1 : value);
	if (min !== null && max !== null) return format(copy.priceBetween, { min: money(min), max: money(upper(max)) });
	if (max !== null) {
		return format(BREAKS_MINOR.includes(max + 1) ? copy.priceUnder : copy.priceUpTo, { max: money(upper(max)) });
	}
	if (min !== null) return format(BREAKS_MINOR.includes(min) ? copy.pricePlus : copy.priceFrom, { min: money(min) });
	return copy.priceAny;
};
