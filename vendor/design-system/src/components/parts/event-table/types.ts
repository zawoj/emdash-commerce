/** One row of the events table. */
export interface EventRowContent {
  readonly day: string
  readonly month: string
  readonly name: string
  readonly href: string
  readonly organizer?: string
  readonly location: string
  readonly region: string
  /** Highlights the row with the accent Date Badge. */
  readonly isFeatured: boolean
  /** Extra-information cell — rendered only when the table has that column. */
  readonly extraInfo?: string
}

/** Column header labels; `extraInfo` adds a third column. */
export interface EventTableColumns {
  readonly event: string
  readonly location: string
  readonly extraInfo?: string
}
