import type { ImageAttrs } from '../../../../types/image'
import type { LinkContent } from '../../../../types/link'

/** The product shown in the hero's last tile: a packshot with its name and price, the whole tile is the link. */
export interface BoardHeroProduct {
  readonly title: string
  readonly href: string
  readonly image: ImageAttrs
  /** The formatted price and its amount for `<data value>`. */
  readonly price: { readonly label: string; readonly value: number }
  /** A small label on the tile ("Customer favourite"). */
  readonly label?: string
}

/** The `board-hero` block: the brand board as a hero — a mosaic of a campaign photo, a volt block, a black wordmark block and a product. */
export interface BoardHeroProps {
  /** The page's H1, set in huge condensed caps over the photo. */
  readonly heading: string
  /** Labels the section; unique per page. */
  readonly headingId?: string
  readonly eyebrow?: string
  /** The campaign photo; above the fold, so it loads eagerly. */
  readonly image: ImageAttrs
  /** The one dominant call to action (volt pill). */
  readonly action: LinkContent
  /** The brand line in the volt block ("Go"). */
  readonly voltText: string
  /** The brand line in the black block ("Keep going"). */
  readonly blackText: string
  /** The wordmark's accessible name. */
  readonly brandName: string
  /** A quieter link in the black block. */
  readonly secondaryAction?: LinkContent
  readonly product: BoardHeroProduct
}
