import type { SpecRow } from '../spec-table/types'

/** The tabs of the details area, in display order; also the ids of their panels and `#hash`es. */
export const productDetailsTabs = {
  description: 'description',
  specification: 'specification',
  manufacturer: 'manufacturer',
} as const

export type ProductDetailsTab = (typeof productDetailsTabs)[keyof typeof productDetailsTabs]

/** A titled block of facts (specification, manufacturer, delivery and returns). */
export interface ProductDetailsPanel {
  readonly title: string
  /** Names the table for assistive tech. */
  readonly caption: string
  readonly rows: readonly SpecRow[]
  /** A line of small print under the rows. */
  readonly note?: string
}

/** The "Product details" area under the gallery and the buy box. The long description is the default slot. */
export interface ProductDetailsProps {
  /** The section's H2. */
  readonly heading: string
  readonly headingId?: string
  /** Tab labels (also the panels' headings when the script is off). A tab without content is not rendered. */
  readonly tabLabels: Readonly<Record<ProductDetailsTab, string>>
  /** A few key points pulled out above the description. */
  readonly highlights?: readonly string[]
  readonly highlightsHeading?: string
  /** Toggle labels of a description longer than the collapsed height. */
  readonly readMoreLabel: string
  readonly readLessLabel: string
  /** The specification tab. */
  readonly specification?: ProductDetailsPanel
  /** The manufacturer tab: who placed the product on the market (GPSR). */
  readonly manufacturer?: ProductDetailsPanel
  /** Not a tab: a compact block under the tabbed area. */
  readonly delivery?: ProductDetailsPanel
}
