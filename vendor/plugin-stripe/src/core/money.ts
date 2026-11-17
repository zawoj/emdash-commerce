/**
 * Money is always an integer amount in the currency's minor unit plus a lowercase ISO 4217 code.
 * Conversion to and from major units happens only here, so zero- and three-decimal currencies are
 * handled in exactly one place (Stripe: https://docs.stripe.com/currencies#zero-decimal).
 */

export type CurrencyCode = string & { readonly __brand: "CurrencyCode" };

export interface Money {
	/** Integer in the currency's minor unit (grosze for PLN, yen for JPY). */
	amount: number;
	currency: CurrencyCode;
}

const ZERO_DECIMAL_CURRENCIES: ReadonlySet<string> = new Set([
	"bif",
	"clp",
	"djf",
	"gnf",
	"jpy",
	"kmf",
	"krw",
	"mga",
	"pyg",
	"rwf",
	"ugx",
	"vnd",
	"vuv",
	"xaf",
	"xof",
	"xpf",
]);

const THREE_DECIMAL_CURRENCIES: ReadonlySet<string> = new Set(["bhd", "jod", "kwd", "omr", "tnd"]);

const CURRENCY_PATTERN = /^[a-z]{3}$/;

export const isCurrencyCode = (value: string): value is CurrencyCode => CURRENCY_PATTERN.test(value);

/** Normalises user or Stripe input ("PLN", " pln ") to a `CurrencyCode`, or throws. */
export const toCurrencyCode = (value: string): CurrencyCode => {
	const normalised = value.trim().toLowerCase();
	if (!isCurrencyCode(normalised)) throw new RangeError(`Invalid currency code: ${value}`);
	return normalised;
};

export const currencyDecimals = (currency: CurrencyCode): 0 | 2 | 3 => {
	if (ZERO_DECIMAL_CURRENCIES.has(currency)) return 0;
	if (THREE_DECIMAL_CURRENCIES.has(currency)) return 3;
	return 2;
};

export const isMinorAmount = (amount: number): boolean => Number.isSafeInteger(amount) && amount >= 0;

export const money = (amount: number, currency: CurrencyCode): Money => {
	if (!isMinorAmount(amount)) throw new RangeError(`Amount must be a non-negative safe integer, got ${amount}`);
	return { amount, currency };
};

export const zero = (currency: CurrencyCode): Money => money(0, currency);

const assertSameCurrency = (a: Money, b: Money): void => {
	if (a.currency !== b.currency) throw new RangeError(`Currency mismatch: ${a.currency} vs ${b.currency}`);
};

export const add = (a: Money, b: Money): Money => {
	assertSameCurrency(a, b);
	return money(a.amount + b.amount, a.currency);
};

export const subtract = (a: Money, b: Money): Money => {
	assertSameCurrency(a, b);
	return money(a.amount - b.amount, a.currency);
};

export const multiply = (a: Money, quantity: number): Money => {
	if (!Number.isSafeInteger(quantity) || quantity < 0) throw new RangeError(`Invalid quantity: ${quantity}`);
	return money(a.amount * quantity, a.currency);
};

export const isSameMoney = (a: Money, b: Money): boolean => a.currency === b.currency && a.amount === b.amount;
