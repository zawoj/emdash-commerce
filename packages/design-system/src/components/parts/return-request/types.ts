import type { ImageAttrs } from '../../../types/image'

export interface ReturnRequestLine {
  /** The order line's id: the checkbox value and the suffix of the quantity and reason fields. */
  readonly id: string
  readonly name: string
  readonly variantText?: string
  readonly image?: ImageAttrs
  /** How many can still come back; the stepper's maximum. */
  readonly available: number
  /** "2 can be returned". */
  readonly availableLabel: string
  readonly isChecked: boolean
  readonly quantity: number
  readonly reason: string
}

export interface ReturnRequestLabels {
  /** Legend of the group of items ("Items to return"). */
  readonly legend: string
  readonly quantity: string
  /** "Decrease quantity" / "Increase quantity". */
  readonly decrease: string
  readonly increase: string
  readonly reason: string
  readonly reasonPlaceholder: string
  readonly note: string
}

export interface ReturnRequestProps {
  lines: readonly ReturnRequestLine[]
  reasons: readonly { readonly label: string; readonly value: string }[]
  labels: ReturnRequestLabels
  /** The note the customer typed before an error sent them back. */
  noteValue?: string
  noteMaxLength?: number
}
