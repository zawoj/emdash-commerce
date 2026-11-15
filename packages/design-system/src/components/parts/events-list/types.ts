import type { LinkContent } from '../../../types/link'
import type { EventRowContent } from '../event-table/types'

/** One row of the events list tile (sidebar widget or article body). */
export type EventListItem = Pick<EventRowContent, 'day' | 'month' | 'name' | 'href' | 'location' | 'isFeatured'>

/** Events list tile: tile-title row + event rows. */
export interface EventListContent {
  readonly heading: string
  readonly headingId: string
  /** The title row's link (e.g. to the full calendar). */
  readonly more?: LinkContent
  readonly events: readonly EventListItem[]
}
