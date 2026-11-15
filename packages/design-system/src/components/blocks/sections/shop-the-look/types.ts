import type { ImageAttrs } from '../../../../types/image'
import type { LinkContent } from '../../../../types/link'
import type { PriceCompareAt } from '../../../atoms/price/types'
import type { LookDialogProps } from '../../../parts/look-dialog/types'

/** One product of the look, and the hotspot that marks it on the photo. */
export interface ShopTheLookItem {
  readonly title: string
  readonly href: string
  readonly image: ImageAttrs
  /** The picked or default variant ("Black · M"), or what is to be picked ("Pick a size"). */
  readonly variantLabel?: string
  readonly price: { readonly label: string; readonly value: number }
  readonly compareAtPrice?: PriceCompareAt
  /** The per-item action: "Choose a variant". A link to the product page; with `dialog` the script opens that product's panel instead. */
  readonly action: LinkContent
  /** The product's id in `dialog.products`: the action opens its variant dialog. */
  readonly choiceId?: number
  /** Hotspot position on the photo, in percent of its width / height. */
  readonly x: number
  readonly y: number
}

/** A lookbook photo with numbered hotspots, and beside it what is in the look. */
export interface ShopTheLookProps {
  readonly heading: string
  /** Labels the section; unique per page. */
  readonly headingId?: string
  readonly eyebrow?: string
  readonly image: ImageAttrs
  /** Heading of the list ("In this look"). */
  readonly listHeading: string
  readonly items: readonly ShopTheLookItem[]
  /** Accessible name of a hotspot: `{n}` and `{title}` are replaced ("Item {n}: {title}"). */
  readonly hotspotLabelTemplate: string
  /** The total of every item, with its label ("Total" / "3 items"). */
  readonly total?: { readonly label: string; readonly price: { readonly label: string; readonly value: number } }
  /** What is not included ("Shown with a watch that is not for sale"). */
  readonly note?: string
  /** The one primary action ("Shop the look"). A link; with `dialog` the script opens the kit stepper instead. */
  readonly cta: LinkContent
  /** The variant dialog and kit stepper of the look; without it the actions stay plain links. */
  readonly dialog?: LookDialogProps
}
