import type { LinkContent } from '../../../../types/link'
import type { ArticleCardContent } from '../../../parts/article-card/types'

export interface LatestPostsProps {
  heading: string
  /** Labels the tile's section; unique per page. */
  headingId?: string
  items: readonly ArticleCardContent[]
  /** The title row's link to the full archive. */
  more?: LinkContent
}
