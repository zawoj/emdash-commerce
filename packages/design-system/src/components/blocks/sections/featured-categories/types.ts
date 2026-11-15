import type { ImageAttrs } from '../../../../types/image'
import type { LinkContent } from '../../../../types/link'

export interface FeaturedCategory {
  readonly title: string
  readonly href: string
  readonly image?: ImageAttrs
  /** How much is in it ("48 products"). */
  readonly countLabel?: string
}

export interface FeaturedCategoriesProps {
  heading: string
  headingId?: string
  more?: LinkContent
  items: readonly FeaturedCategory[]
}
