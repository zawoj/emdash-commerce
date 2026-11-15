import type { ImageAttrs } from '../../../types/image'

/** A product as a shop grid shows it. */
export interface ProductCardContent {
  readonly title: string
  readonly href: string
  /** Cover photo; without one the card keeps its empty frame so grid rows stay aligned. */
  readonly image?: ImageAttrs
  /** A second photo that cross-fades in over the cover on hover (desktop pointers only). */
  readonly hoverImage?: ImageAttrs
  /** Sizes shown as a compact row sliding up over the photo on hover (desktop only, presentational). */
  readonly sizes?: readonly { readonly label: string; readonly isAvailable: boolean }[]
  /** Spoken before the available sizes ("Available sizes"); the row itself is hidden from assistive tech. */
  readonly sizesLabel?: string
  readonly excerpt?: string
  readonly price: {
    /** The formatted price. */
    readonly label: string
    readonly value: number
  }
  /** The price a reduction replaces; shown struck through after `price`. */
  readonly compareAtPrice?: {
    readonly label: string
    readonly value: number
    /** Spoken before it ("Regular price:"). */
    readonly prefix?: string
  }
  /** The Omnibus line under a reduced price, complete ("Lowest price in the last 30 days: 139,00 zł"). */
  readonly lowestPriceNote?: string
  /** Short labels over the photo ("-20%", "New"); a few at most. */
  readonly badges?: readonly string[]
  readonly availability?: {
    readonly label: string
    readonly isAvailable: boolean
    /** Few items left ("Last 3 items"): the marker is a triangle. */
    readonly isLow?: boolean
  }
}
