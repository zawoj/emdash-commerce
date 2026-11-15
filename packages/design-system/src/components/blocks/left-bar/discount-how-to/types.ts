import type { LinkContent } from '../../../../types/link'

export interface DiscountHowToProps {
  heading: string
  /** Labels the tile; unique per page. */
  headingId: string
  /** How to redeem the deal. */
  instructions: string
  /** The discount code, shown in a copy field. */
  code?: string
  /** Accessible label of the copy field. */
  copyLabel: string
  /** The button to the partner's offer. */
  cta: LinkContent
}
