export interface ReviewHistogramRow {
  /** The star level of the row, 1–5. */
  readonly stars: number
  /** The row's name ("5 stars"). */
  readonly label: string
  readonly count: number
  /** The share of all reviews, 0–1; sets the bar. */
  readonly share: number
  /** The count as shown ("12" or "12 reviews"). */
  readonly countLabel: string
  /** Where filtering to this level leads; a row without one is plain text. */
  readonly href?: string
  /** This level is the active filter. */
  readonly isCurrent?: boolean
}

export interface ReviewSummaryProps {
  /** The average, formatted ("4,5"); empty when there are no reviews. */
  average: string
  /** The average as a number for the stars; 0 when there are no reviews. */
  averageValue: number
  /** The stars' accessible text ("4.5 out of 5"). */
  averageLabel: string
  /** "12 reviews". */
  countLabel: string
  /** Names the histogram list ("Filter reviews by rating"). */
  histogramLabel: string
  rows: readonly ReviewHistogramRow[]
  /** Removes the active filter. */
  clearFilter?: { readonly label: string; readonly href: string }
  /** Said instead of the histogram while nobody has reviewed ("No reviews yet."). */
  emptyText?: string
  /** Spoken after a row's label when it is the active filter ("selected"). */
  currentLabel?: string
}
