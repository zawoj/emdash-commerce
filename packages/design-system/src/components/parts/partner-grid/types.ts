import type { PartnerCardContent } from '../partner-card/types'

/** The partners list: a grid of partner cards. */
export interface PartnerGridProps {
  /** Names the section for assistive technology. */
  label: string
  partners: readonly PartnerCardContent[]
  /** Shown instead of the grid when there is no partner. */
  emptyLabel: string
}
