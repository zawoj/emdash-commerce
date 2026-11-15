import type { DisplayDate } from '../../../types/date'
import type { ImageAttrs } from '../../../types/image'
import type { StatusTone } from '../../atoms/status-badge/variants'
import type { OrderProgressProps } from '../order-progress/types'

export interface OrderCardAction {
  readonly label: string
  readonly href: string
}

export interface OrderCardProps {
  /** The order number; the card's heading and link to the order. */
  number: string
  href: string
  /** Accessible text added to the number link ("View order"). */
  viewLabel: string
  date: DisplayDate
  /** "Placed on" style prefix of the date. */
  dateLabel: string
  total: string
  /** The one human status ("On its way") with the tone of its marker. */
  status: { readonly label: string; readonly tone: StatusTone }
  /** A quiet line under the status ("Delivery by Fri 13 Nov"). */
  detail?: string
  images: readonly ImageAttrs[]
  /** "+2" when more items follow the shown photos. */
  moreLabel?: string
  /** Summary of the items in words ("Classic hoodie + 2 more"). */
  summary?: string
  progress?: OrderProgressProps
  /** The primary action (pay, track, return) and a quiet secondary link. */
  action?: OrderCardAction
  secondaryAction?: OrderCardAction
  /** Heading level of the number (default 3). */
  headingLevel?: 2 | 3
}
