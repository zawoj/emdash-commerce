import type { SpecRow } from '../spec-table/types'

/** A titled block of facts (specification, manufacturer, delivery and returns): one accordion row. */
export interface ProductDetailsPanel {
  /** The accordion row's title. */
  readonly title: string
  /** Names the table for assistive tech. */
  readonly caption: string
  readonly rows: readonly SpecRow[]
  /** A line of small print under the rows. */
  readonly note?: string
}

/** The product's long-form facts as short accordion rows. The long description is the default slot. */
export interface ProductDetailsProps {
  /** The section's H2, visible to assistive tech only (the rows are the visible structure). */
  readonly heading: string
  readonly headingId?: string
  /** The description row's title. A row without content is not rendered. */
  readonly descriptionLabel: string
  /** A few key points pulled out above the description. */
  readonly highlights?: readonly string[]
  /** The specification row. */
  readonly specification?: ProductDetailsPanel
  /** The manufacturer row: who placed the product on the market (GPSR). */
  readonly manufacturer?: ProductDetailsPanel
  /** The delivery and returns row. */
  readonly delivery?: ProductDetailsPanel
}
