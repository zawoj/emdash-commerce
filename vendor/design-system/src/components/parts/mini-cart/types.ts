import type { LinkContent } from '../../../types/link'
import type { CartLineContent } from '../../molecules/cart-line/types'
import type { FreeShippingProgressProps } from '../../molecules/free-shipping-progress/types'
import type { EmptyStateProps } from '../empty-state/types'

export interface MiniCartProps {
  /** The dialog's id: the header's cart link points its `data-mini-cart-open` at it. */
  id: string
  /** The drawer's heading ("Your cart"). */
  heading: string
  closeLabel: string
  lines: readonly CartLineContent[]
  /** The form's target for quantity changes and removals. */
  action: string
  /** The subtotal row ("Subtotal" / "339,00 zł"). */
  subtotal: { readonly label: string; readonly value: string }
  /** A line under the subtotal ("Delivery and discounts are calculated at checkout."). */
  note?: string
  freeShipping?: FreeShippingProgressProps
  /** The primary button to the checkout and the secondary link to the cart page. */
  checkout: LinkContent
  viewCart: LinkContent
  /** Shown instead of the lines when the cart is empty. */
  empty: EmptyStateProps
  /** Shows the drawer open and non-modal (previews, tests); in an app it opens by script. */
  isOpen?: boolean
}
