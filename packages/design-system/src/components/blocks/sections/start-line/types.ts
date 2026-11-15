import type { LinkContent } from '../../../../types/link'
import type { EventFeatureItem } from '../../../parts/events-feature/types'

export interface StartLineProps {
  heading: string
  /** Labels the section; unique per page. */
  headingId: string
  /** The panel's button to the full calendar. */
  cta: LinkContent
  events: readonly EventFeatureItem[]
}
