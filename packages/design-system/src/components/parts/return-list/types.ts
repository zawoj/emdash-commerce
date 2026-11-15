import type { StatusTone } from '../../atoms/status-badge/variants'
import type { OrderProgressProps } from '../order-progress/types'

export interface ReturnListItem {
  /** The return's number. */
  readonly number: string
  /** Link to the order the return belongs to, and its text ("Order ORD-1"). */
  readonly orderHref: string
  readonly orderLabel: string
  /** "Requested 10 November 2026". */
  readonly requestedOn: string
  readonly status: { readonly label: string; readonly tone: StatusTone }
  /** The steps of the return; left out for a rejected one. */
  readonly progress?: OrderProgressProps
  /** One text per returned line ("Hoodie × 1 — Too small"). */
  readonly lines: readonly string[]
  readonly note?: string
  /** "Refund: PLN 99.00" once staff decided. */
  readonly refund?: string
}

export interface ReturnListProps {
  returns: readonly ReturnListItem[]
  /** Accessible name of the list ("Your returns"). */
  label: string
}
