import type { DisplayDate } from '../../../types/date'
import type { TileHeading } from '../../../types/heading'
import type { ImageAttrs } from '../../../types/image'
import type { ArticleCardContent } from '../article-card/types'

/** Lead article of a category tile (Figma 944:29547): photo, 20px title, excerpt (2 lines), date. */
export interface CategoryTileLead {
  readonly title: string
  readonly href: string
  /** Cover photo; without one the frame stays empty so the sibling tile's rows keep lining up. */
  readonly image?: ImageAttrs
  readonly date: DisplayDate
  /** One entry per paragraph (the tile shows the first 2 lines). */
  readonly excerpt: readonly string[]
}

/** Figma "tile" with a lead article over a list of `row` card-articles (home 944:29543 / 944:29561). */
export interface CategoryTileContent extends TileHeading {
  readonly lead: CategoryTileLead
  readonly articles: readonly ArticleCardContent[]
}
