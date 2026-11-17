import type { LinkContent } from '../../../types/link'
import type { EventRowContent } from '../event-table/types'

/** One event card of the events feature tile. */
export type EventFeatureItem = Pick<EventRowContent, 'day' | 'month' | 'name' | 'href' | 'location'>

/** Events feature: the accent panel (heading + calendar link) beside event cards. */
export interface EventFeatureContent {
  readonly heading: string
  readonly headingId: string
  readonly cta: LinkContent
  readonly events: readonly EventFeatureItem[]
}
