import type { TimelineState } from '../../molecules/timeline/variants'

export interface OrderProgressStep {
  /** "Received", "Paid", "Shipped", "Delivered". */
  readonly label: string
  readonly state: TimelineState
  /** Spoken state ("Completed", "Current step", "Upcoming"). */
  readonly stateLabel: string
}

export interface OrderProgressProps {
  steps: readonly OrderProgressStep[]
  /** Accessible name ("Order progress"). */
  label: string
}
