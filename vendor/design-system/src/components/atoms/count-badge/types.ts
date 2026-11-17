import type { PluralLabelForms } from '../../../utils/plural-label'

export interface CountBadgeProps {
  count: number
  /** Spoken text with a `{count}` placeholder ("{count} items in the cart"); the text of every plural category without its own form. */
  labelTemplate: string
  /** Spoken texts per plural category of `locale` ("1 item in the cart" for `one`). */
  labelForms?: PluralLabelForms
  /** BCP 47 tag that picks the plural category ("en", "pl"); English rules when omitted. */
  locale?: string
  /** Counts above this show as "<max>+". */
  max?: number
}
