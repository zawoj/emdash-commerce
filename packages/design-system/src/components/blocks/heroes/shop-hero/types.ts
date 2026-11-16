import type { ImageAttrs } from '../../../../types/image'
import type { LinkContent } from '../../../../types/link'

/** The product shown on the hero's packshot tile: name, price, the whole tile is the link. */
export interface ShopHeroProduct {
  readonly title: string
  readonly href: string
  readonly image: ImageAttrs
  /** The formatted price and its amount for `<data value>`. */
  readonly price: { readonly label: string; readonly value: number }
  /** A small chip on the tile ("Customer favourite"). */
  readonly label?: string
}

/** A category shortcut under the hero: a pill with a round thumbnail. */
export interface ShopHeroCategory extends LinkContent {
  readonly image?: ImageAttrs
}

/** The `shop-hero` block: one campaign photo with one dominant call to action, one packshot, and the categories as pills. */
export interface ShopHeroProps {
  /** The page's H1. */
  readonly heading: string
  /** Labels the section; unique per page. */
  readonly headingId?: string
  readonly eyebrow?: string
  /** The campaign photo; above the fold, so it loads eagerly. */
  readonly image: ImageAttrs
  /** A flat charcoal scrim under the copy; off for artwork that already has a dark field behind the text. Default on. */
  readonly hasScrim?: boolean
  /** The one dominant call to action. */
  readonly action: LinkContent
  /** A quieter text link beside it. */
  readonly secondaryAction?: LinkContent
  /** The packshot tile; hidden on a phone, where the categories come first. */
  readonly product?: ShopHeroProduct
  /** Category shortcuts, visible above the fold on a phone. */
  readonly categories: readonly ShopHeroCategory[]
  /** Names the category navigation. */
  readonly categoriesLabel: string
}
