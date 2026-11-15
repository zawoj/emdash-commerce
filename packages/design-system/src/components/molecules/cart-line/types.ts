import type { ImageAttrs } from '../../../types/image'
import type { LinkContent } from '../../../types/link'
import type { NoticeTone } from '../../atoms/inline-notice/variants'

export interface CartMoney {
  /** The formatted amount. */
  readonly label: string
  readonly value: number
}

export interface CartLineQuantity {
  /** The number input's name (`quantity[<lineId>]`). */
  readonly name: string
  readonly value: number
  readonly min?: number
  readonly max?: number
  /** Accessible name of the input ("Quantity of Trail Runner shoes"). */
  readonly label: string
  readonly decreaseLabel: string
  readonly increaseLabel: string
}

export interface CartLineRemove {
  /** Visible text of the remove button ("Remove"). */
  readonly label: string
  /** Accessible name when the visible text is not enough ("Remove Trail Runner shoes"). */
  readonly ariaLabel?: string
  /** The submit button's name/value pair identifying the line (`remove` = line id). */
  readonly name: string
  readonly value: string
}

export interface CartLineNotice {
  readonly tone: NoticeTone
  readonly text: string
  readonly toneLabel?: string
}

/** One line of a cart as the cart page and the mini-cart show it. */
export interface CartLineContent {
  /** Stable key of the line; prefixes the control ids. */
  readonly id: string
  readonly name: LinkContent
  readonly image?: ImageAttrs
  /** The chosen variant in words ("Colour: Black · Size: 42"). */
  readonly variantText?: string
  readonly unitPrice: CartMoney
  /** The price the line was added at when it has changed since (shown struck through). */
  readonly previousUnitPrice?: CartMoney
  /** Says the price changed ("The price has dropped since you added it."). */
  readonly priceChangedNote?: string
  readonly linePrice: CartMoney
  /** The line total before discounts, struck through beside `linePrice` when a promotion took something off. */
  readonly previousLinePrice?: CartMoney
  /** What the discounts saved on this line ("You save 37,35 zł"). */
  readonly savingsText?: string
  readonly quantity: CartLineQuantity
  readonly remove: CartLineRemove
  /** A status beside the line (stock clamped, last items…). */
  readonly notice?: CartLineNotice
  /** The product can no longer be bought: the line is dimmed, its quantity is locked, `unavailableText` explains. */
  readonly isUnavailable?: boolean
  readonly unavailableText?: string
  /** The unit price's spoken prefix when it is struck through ("Previous price:"). */
  readonly previousPriceLabel?: string
}

export interface CartLineProps {
  line: CartLineContent
  /** A narrow layout for the mini-cart: smaller thumbnail, no separate line total column. */
  isCompact?: boolean
}
