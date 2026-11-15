import type { ArticleCardContent } from '../../../parts/article-card/types'

export interface RelatedPostsProps {
  heading: string
  /** Labels the tile's section; unique per page. */
  headingId?: string
  items: readonly ArticleCardContent[]
}
