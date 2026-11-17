import type { EventDetailsVariant } from './variants'
import type { ImageAsset } from '../../../../types/asset'
import type { DisplayDate } from '../../../../types/date'
import type { LinkContent } from '../../../../types/link'

/** A labelled fact: the label over its value. */
export interface EventDetailsFact {
  readonly label: string
  readonly value: string
}

export interface EventDetailsProps {
  variant?: EventDetailsVariant
  heading: string
  /** Labels the tile's section; unique per page. */
  headingId: string
  /** A wordmark in the card's header; without it the card has no header. */
  wordmark?: ImageAsset
  name?: EventDetailsFact
  date?: {
    readonly label: string
    readonly start: DisplayDate
    /** The last day of an event that runs over several days. */
    readonly end?: DisplayDate
  }
  location?: EventDetailsFact
  organizer?: EventDetailsFact
  /** More labelled facts (licence, patronage, …), listed after the organizer. */
  extras?: readonly EventDetailsFact[]
  /** The sign-up link, present while registration is open. */
  cta?: LinkContent
}
