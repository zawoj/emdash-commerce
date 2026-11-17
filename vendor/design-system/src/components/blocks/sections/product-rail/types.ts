import type { LinkContent } from '../../../../types/link'
import type { ProductCardContent } from '../../../parts/product-card/types'

/** A collection tab above the rail: a plain link to the page of that collection. */
export interface ProductRailTab extends LinkContent {
  readonly isCurrent?: boolean
}

/** A horizontal row of product cards; the next card's edge always peeks in. */
export interface ProductRailProps {
  heading: string
  /** Labels the section; unique per page. */
  headingId?: string
  products: readonly ProductCardContent[]
  /** Collection links beside the heading; the current one is underlined. */
  tabs?: readonly ProductRailTab[]
  /** Names the tab navigation for screen readers. */
  tabsLabel?: string
  /** The link to the whole listing. */
  more?: LinkContent
  /** Names the scrollable region of cards ("New releases, scrolls sideways"). */
  label: string
  prevLabel: string
  nextLabel: string
  /** How many of the first cards load eagerly. */
  eagerCount?: number
}
