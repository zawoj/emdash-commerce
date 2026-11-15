import type { LinkContent } from '../../../../types/link'
import type { ArticleCardContent } from '../../../parts/article-card/types'
import type { PartnerCredit } from '../../../parts/powered-by/types'

export interface CategoryGridProps {
  heading: string
  /** Labels the tile's section; unique per page. */
  headingId?: string
  /** The title row's link to the category's archive. */
  more?: LinkContent
  /** The category's strategic partner, credited after the heading. */
  credit?: PartnerCredit
  items: readonly ArticleCardContent[]
}
