import type { CartLineContent } from '../../molecules/cart-line/types'

export interface CartLinesColumnLabels {
  readonly product: string
  readonly quantity: string
  readonly total: string
}

export interface CartLinesProps {
  lines: readonly CartLineContent[]
  /** The form's target: quantity changes and removals post here. */
  action: string
  method?: 'post'
  /** Accessible name of the list ("Products in your cart"). */
  label: string
  /** Column headings shown on a wide screen above the lines. */
  columnLabels?: CartLinesColumnLabels
  /** Text of the "update quantities" button, shown only when scripts are off. */
  updateLabel?: string
  /** Names the lines' form (`data-cart-form`) so the app's script can submit it on `change`. */
  formId?: string
}
