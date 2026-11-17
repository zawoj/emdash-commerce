import type { UpcomingEventsVariant } from './variants'
import type { LinkContent } from '../../../../types/link'
import type { EventRowContent, EventTableColumns } from '../../../parts/event-table/types'

export interface UpcomingEventsProps {
  /** `table` in the page's zones, `list` in a bar. */
  variant: UpcomingEventsVariant
  heading: string
  /** Labels the tile; unique per page. */
  headingId: string
  /** The title row's link to the full calendar. */
  more?: LinkContent
  /** Column headers of the `table` look. */
  columns: EventTableColumns
  events: readonly EventRowContent[]
}
