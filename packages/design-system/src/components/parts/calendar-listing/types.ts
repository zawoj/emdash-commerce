import type { EventRowContent, EventTableColumns } from '../event-table/types'
import type { PaginationBarProps } from '../pagination-bar/types'

/** One select of the filter row. */
export interface CalendarListingSelect {
  readonly id: string
  readonly name: string
  readonly ariaLabel: string
  readonly options: readonly { readonly label: string; readonly value: string }[]
  readonly value?: string
}

/** A table of events, with an optional heading above it. */
export interface CalendarListingSection {
  readonly heading?: string
  /** Labels the section; unique per page. */
  readonly headingId?: string
  readonly events: readonly EventRowContent[]
}

/** Figma "kalendarz" col-main (1023:58387): the search form, the events table tile and the pagination. */
export interface CalendarListingProps {
  /** Where the form submits (GET). */
  action: string
  search: {
    readonly id: string
    readonly name: string
    readonly placeholder: string
    readonly ariaLabel: string
    readonly value?: string
  }
  filterLabel: string
  filters: readonly CalendarListingSelect[]
  /** The sort select; without it the sort group is left out. */
  sortLabel?: string
  sort?: CalendarListingSelect
  columns: EventTableColumns
  /** The tables in the order they are shown; none renders `emptyLabel`. */
  sections: readonly CalendarListingSection[]
  /** Names the tile of tables for assistive technology. */
  label: string
  emptyLabel: string
  /** Absent when everything fits one page. */
  pagination?: PaginationBarProps
}
