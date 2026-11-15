import type { LinkContent } from '../../../../types/link'

/** One row of the opening hours: the days and the hours on them, both as the editor wrote them. */
export interface ContactHour {
  readonly days: string
  readonly hours: string
}

/** The `contact` block: the address, phone and email beside the opening hours. Every part is optional. */
export interface ContactProps {
  readonly title: string
  readonly address?: string
  readonly phone?: string
  readonly email?: string
  /** The booking link (opens in a new tab). */
  readonly reservation?: LinkContent
  readonly hours?: readonly ContactHour[]
  /** Names the list of opening hours. */
  readonly hoursLabel: string
}
