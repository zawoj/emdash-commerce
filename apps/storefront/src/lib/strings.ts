import { catalogCopy, type CatalogCopy } from "../features/catalog/copy";
import { cartCopy, type CartCopy } from "../features/cart/copy";
import { contentCopy, type ContentCopy } from "../features/content/copy";
import { checkoutCopy, type CheckoutCopy } from "../features/checkout/copy";
import { ordersCopy, type OrdersCopy } from "../features/orders/copy";
import { intlLocaleOf, type Locale } from "./i18n";

export const format = (template: string, values: Record<string, string | number>): string =>
	Object.entries(values).reduce((result, [key, value]) => result.replace(`{${key}}`, String(value)), template);

/** Texts per plural category of the language (`one`, `few`, `many`, `other`); `other` is required, a missing one falls back to it. */
export type PluralForms = { other: string } & Partial<Record<Intl.LDMLPluralRule, string>>;

/** The form of `forms` that `count` takes in the locale ("1 produkt", "2 produkty", "5 produktów"), with `{count}` filled in. */
export const pluralize = (locale: Locale, count: number, forms: PluralForms): string => {
	const category = new Intl.PluralRules(intlLocaleOf(locale)).select(count);
	return format(forms[category] ?? forms.other, { count });
};

export const catalogStrings = (locale: Locale): CatalogCopy => catalogCopy[locale];
export const cartStrings = (locale: Locale): CartCopy => cartCopy[locale];
export const checkoutStrings = (locale: Locale): CheckoutCopy => checkoutCopy[locale];
export const ordersStrings = (locale: Locale): OrdersCopy => ordersCopy[locale];
export const contentStrings = (locale: Locale): ContentCopy => contentCopy[locale];
