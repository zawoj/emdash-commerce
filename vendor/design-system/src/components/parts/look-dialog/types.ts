import type { ImageAttrs } from '../../../types/image'
import type { PriceCompareAt } from '../../atoms/price/types'
import type { VariantPickerProps } from '../../molecules/variant-picker/types'

/** One price a product of the look can show: the product's "from" price, or the price of one variant. */
export interface LookPrice {
  /** The formatted price ("639,00 zł", "od 639,00 zł"). */
  readonly label: string
  /** The amount for `<data value>`. */
  readonly value: number
  /** The amount in minor units (grosze), summed for the kit's total. */
  readonly minor: number
  readonly compareAt?: PriceCompareAt
  /** The Omnibus line of a reduced price. */
  readonly omnibus?: string
  /** "VAT included" and the like. */
  readonly note?: string
}

/** What the browser keeps of a variant: which options name it, whether it can be bought and which price it shows. */
export interface LookVariant {
  readonly id: number
  /** Value code per axis code. */
  readonly options: Readonly<Record<string, string>>
  readonly isPurchasable: boolean
  /** Index into the product's `prices`. */
  readonly price: number
  /** "Last 2 items": only a variant that is low on stock (or back-ordered) carries one. */
  readonly note?: string
  readonly isLow?: boolean
}

/** A product of the look as the dialog needs it: the picker, the prices and the small variant table the picker's script reads. */
export interface LookProductChoice {
  /** The product's id: what the cart's add endpoint is given with the variant id. */
  readonly id: number
  readonly title: string
  /** The product page ("See product details"). */
  readonly href: string
  /** The photo shown until a colour with a photo of its own is chosen. */
  readonly image: ImageAttrs
  /** Photos of single colours (a variant's own photo), keyed by the colour's value code. */
  readonly colourImages?: readonly { readonly group: string; readonly image: ImageAttrs }[]
  /** The axes as chips, with the preselected values checked; null for a product without variants. */
  readonly picker: VariantPickerProps | null
  /** The price shown before a variant is named ("from 639,00 zł"). */
  readonly defaultPrice: LookPrice
  /** The variant prices, deduplicated; `LookVariant.price` indexes into it. */
  readonly prices: readonly LookPrice[]
  readonly axes: readonly string[]
  readonly imageAxis: string | null
  readonly variants: readonly LookVariant[]
}

/** Every visible or spoken word of the dialog. `{…}` placeholders are replaced by the script. */
export interface LookDialogCopy {
  readonly close: string
  /** The dialog's heading when one product is opened. */
  readonly chooseHeading: string
  /** The dialog's heading in kit mode. */
  readonly kitHeading: string
  /** "See product details". */
  readonly details: string
  readonly addToCart: string
  readonly adding: string
  readonly soldOut: string
  /** "Product {current} of {total}". */
  readonly stepLabel: string
  readonly summaryLabel: string
  readonly next: string
  readonly skip: string
  readonly back: string
  /** "Choose: {axis}" (what is missing when "add" or "next" is pressed early). */
  readonly missing: string
  readonly soldOutHint: string
  readonly change: string
  readonly skipped: string
  /** Shown on the summary when the shopper has not chosen or skipped that product. */
  readonly notChosen: string
  readonly total: string
  readonly addAll: string
  /** Kit summary: checkout with every chosen line (outline, beside add-all). */
  readonly buySet: string
  /** The add-all button after some items went in and others failed. */
  readonly addRemaining: string
  readonly nothingChosen: string
  readonly rowAdded: string
  /** "Added {added} of {total}. Not added: {titles}." */
  readonly partial: string
  readonly addFailed: string
}

export interface LookDialogMoney {
  /** BCP 47 tag for `Intl.NumberFormat` ("pl-PL"). */
  readonly locale: string
  readonly currency: string
}

export interface LookDialogProps {
  /** Prefix of every id; unique per page. */
  readonly id: string
  readonly products: readonly LookProductChoice[]
  readonly copy: LookDialogCopy
  readonly money: LookDialogMoney
}
