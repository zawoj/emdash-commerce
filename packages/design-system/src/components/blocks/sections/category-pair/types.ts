import type { CategoryTileContent } from '../../../parts/category-tile/types'

export interface CategoryPairProps {
  /** The two category tiles side by side; the pair defines the rows both subgrid into. */
  tiles: readonly CategoryTileContent[]
}
