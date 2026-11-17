import type { ProductCardContent } from '../product-card/types'

export interface ListingGridProps {
  readonly products: readonly ProductCardContent[]
  /** How many of the first cards load their photo eagerly (the ones above the fold). */
  readonly eagerCount?: number
}
