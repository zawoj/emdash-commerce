import type { DisplayDate } from '../../../types/date'
import type { ImageAttrs } from '../../../types/image'
import type { StatusTone } from '../../atoms/status-badge/variants'

export interface OrderStatus {
  /** What the status is about ("Payment"). */
  readonly axis: string
  readonly label: string
  readonly tone: StatusTone
}

export interface OrderListItem {
  /** The order number ("ZV-100245"). */
  readonly number: string
  /** The link to the order. */
  readonly href: string
  readonly date: DisplayDate
  /** The total, formatted. */
  readonly total: string
  /** The ONE human status of the order ("On its way"). */
  readonly status?: { readonly label: string; readonly tone: StatusTone }
  /** A quiet line under the status ("Return requested", "Delivery by Fri 13 Nov"). */
  readonly detail?: string
  /** Product photos of the order, shown as a stack. */
  readonly images?: readonly ImageAttrs[]
  /** "+2" when more items follow the shown photos. */
  readonly moreLabel?: string
  /** Order, payment and fulfilment status as separate badges — the long form, used when there is no single `status`. */
  readonly statuses?: readonly OrderStatus[]
  /** What was ordered in a few words ("Trail Runner shoes + 2 more"). */
  readonly summary?: string
}

export interface OrderListProps {
  orders: readonly OrderListItem[]
  /** Accessible name of the list ("Your orders"). */
  label: string
  /** Captions of the date and total ("Placed on" / "Total"). */
  dateLabel: string
  totalLabel: string
  /** Text of each row's affordance ("View order"); the order number is the row's one link. */
  viewLabel: string
}
