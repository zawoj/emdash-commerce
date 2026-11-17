import type { LinkContent } from '../../../../types/link'
import type { ArticleCardContent } from '../../../parts/article-card/types'

export interface CategoryDarkTileProps {
  heading: string
  /** Labels the tile's section; unique per page. */
  headingId?: string
  /** The title row's link to the category's archive. */
  more?: LinkContent
  /** The two horizontal feature cards (with an author and an excerpt). */
  featureItems: readonly ArticleCardContent[]
  /** The row of small cards below them. */
  items: readonly ArticleCardContent[]
}
