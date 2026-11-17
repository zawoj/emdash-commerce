import type { DiscountsVariant } from './variants'
import type { DealCardContent } from '../../../parts/deal-card/types'

export interface DiscountsProps {
  /** `row` in the page's zones, `stack` in a bar. */
  variant: DiscountsVariant
  /** Shown above the cards when given; Figma's row has none. */
  heading?: string
  /** Labels the section; unique per page. */
  headingId: string
  deals: readonly DealCardContent[]
}
