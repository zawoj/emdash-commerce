import type { LinkContent } from '../../../../types/link'
import type { ProductCardContent } from '../../../parts/product-card/types'

export interface ProductGridProps {
  heading: string
  /** Labels the section; unique per page. */
  headingId?: string
  /** The title row's link to the whole listing. */
  more?: LinkContent
  products: readonly ProductCardContent[]
  /** How many of the first cards load eagerly (a grid at the top of the page); the rest are lazy. */
  eagerCount?: number
}
