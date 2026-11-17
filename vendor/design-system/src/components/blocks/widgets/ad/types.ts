import type { AdContent } from '../../../parts/ad-tile/types'
import type { AdTilePlacement } from '../../../parts/ad-tile/variants'

/** One campaign eligible for the slot. */
export type AdCampaign = AdContent

export interface AdProps {
  placement: AdTilePlacement
  /** Equal in priority: one is picked per page view; the first one shows without JavaScript. */
  readonly campaigns: readonly AdCampaign[]
}
