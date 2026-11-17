// A spoken count ("1 item in the cart", "5 items in the cart") picked per plural category of the language.
// Shared by the server render (`CountBadge`) and the script that rewrites it when the count changes.
export type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many'

/** Texts per plural category with a `{count}` placeholder; a category without its own form falls back to the template. */
export type PluralLabelForms = Partial<Record<PluralCategory, string>>

/** The text for `count` in `locale`: the matching form, else `template`, with `{count}` filled in. */
export const pluralLabel = (template: string, forms: PluralLabelForms | undefined, locale: string | undefined, count: number): string => {
  const category = new Intl.PluralRules(locale || 'en').select(count)
  const text = (category === 'other' ? undefined : forms?.[category]) ?? template
  return text.replace('{count}', String(count))
}
