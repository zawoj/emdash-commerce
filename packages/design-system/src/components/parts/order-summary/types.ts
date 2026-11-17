import type { ImageAttrs } from '../../../types/image'

export interface SummaryLine {
  readonly name: string
  readonly image?: ImageAttrs
  readonly variantText?: string
  /** The quantity in words ("× 2" / "Qty: 2"). */
  readonly quantityLabel: string
  /** The line total, formatted. */
  readonly price: string
}

export interface SummaryRow {
  readonly label: string
  /** Pre-formatted ("-20,00 zł", "Free"). */
  readonly value: string
  /** Discounts read as a reduction; muted rows (tax lines) are secondary. */
  readonly kind?: 'default' | 'discount' | 'muted'
  /** A short note under the label ("InPost Paczkomat"). */
  readonly note?: string
  /** Optional stable hook for automated tests (`cart-subtotal`, …). */
  readonly testId?: string
}

export interface OrderSummaryProps {
  heading: string
  headingLevel?: 2 | 3
  /** Thumbnail lines; the same thumbnails as the cart (CHK-21). */
  lines?: readonly SummaryLine[]
  /** Accessible name of the line list ("Items in your order"). */
  linesLabel?: string
  /** Subtotal, discounts, delivery — in this order. */
  rows: readonly SummaryRow[]
  /** The grand total. */
  total: { readonly label: string; readonly value: string }
  /** What the shopper saved, said once under the total ("You save 109,60 zł"); omitted when nothing was discounted. */
  savings?: string
  /** Tax lines under the total ("Including VAT 23%"). */
  taxRows?: readonly SummaryRow[]
}
