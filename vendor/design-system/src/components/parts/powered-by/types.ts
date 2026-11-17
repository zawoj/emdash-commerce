import type { ImageAttrs } from '../../../types/image'
import type { CategoryKey } from '../../atoms/category-label/variants'

/** Figma "Frame 481303": the "powered by" caption (in the category color) + partner logo. */
export interface PartnerCredit {
  readonly caption: string
  /** The caption's colour as a palette key; `color` wins when both are set. */
  readonly category?: CategoryKey
  /** The caption's colour as any CSS colour (a CMS category's hex). */
  readonly color?: string
  readonly logo: ImageAttrs
}
