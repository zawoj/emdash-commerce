export const LOCALES = { en: "en", pl: "pl" } as const;
export type Locale = (typeof LOCALES)[keyof typeof LOCALES];

const INTL_LOCALE: Record<Locale, string> = { en: "en-US", pl: "pl-PL" };

export const intlLocaleOf = (locale: Locale): string => INTL_LOCALE[locale];

export const resolveLocale = (lang: string | undefined): Locale =>
	lang === LOCALES.pl ? LOCALES.pl : LOCALES.en;
