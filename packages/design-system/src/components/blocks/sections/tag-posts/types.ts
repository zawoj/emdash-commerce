import type { LinkContent } from '../../../../types/link'
import type { ArticleCardContent } from '../../../parts/article-card/types'

export interface TagPostsProps {
  heading: string
  /** Labels the tile's section; unique per page. */
  headingId?: string
  /** The title row's link to the tag's page. */
  more?: LinkContent
  /** Numbered in the order given; each shows its category, title, author and date. */
  items: readonly ArticleCardContent[]
}
