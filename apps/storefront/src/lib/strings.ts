import { catalogCopy, type CatalogCopy } from "../features/catalog/copy";
import { cartCopy, type CartCopy } from "../features/cart/copy";
import { contentCopy, type ContentCopy } from "../features/content/copy";
import type { Locale } from "./i18n";

export const format = (template: string, values: Record<string, string | number>): string =>
	Object.entries(values).reduce((result, [key, value]) => result.replace(`{${key}}`, String(value)), template);

export const catalogStrings = (locale: Locale): CatalogCopy => catalogCopy[locale];
export const cartStrings = (locale: Locale): CartCopy => cartCopy[locale];
export const contentStrings = (locale: Locale): ContentCopy => contentCopy[locale];
