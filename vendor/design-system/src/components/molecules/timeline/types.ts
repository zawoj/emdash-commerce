import type { TimelineState } from './variants'
import type { DisplayDate } from '../../../types/date'

export interface TimelineItem {
  readonly label: string
  readonly state: TimelineState
  /** Spoken state ("Completed", "Current step", "Upcoming"); the marker shape is not read out. */
  readonly stateLabel: string
  readonly description?: string
  readonly date?: DisplayDate
}

export interface TimelineProps {
  items: readonly TimelineItem[]
  /** Accessible name of the list ("Order progress"). */
  label: string
}
