import type { Locale } from "./i18n";
import { intlLocaleOf } from "./i18n";

export const DEFAULT_CURRENCY = "PLN";

const formatters = new Map<string, Intl.NumberFormat>();

const formatterFor = (locale: Locale, currency: string): Intl.NumberFormat => {
	const key = `${locale}:${currency}`;
	const cached = formatters.get(key);
	if (cached) return cached;
	const created = new Intl.NumberFormat(intlLocaleOf(locale), { style: "currency", currency: currency.toUpperCase() });
	formatters.set(key, created);
	return created;
};

export const toDecimalString = (minor: number): `${number}` => {
	const sign = minor < 0 ? "-" : "";
	const abs = Math.abs(Math.trunc(minor));
	return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}` as `${number}`;
};

export const formatMoney = (minor: number, locale: Locale, currency: string = DEFAULT_CURRENCY): string =>
	formatterFor(locale, currency).format(toDecimalString(minor));
