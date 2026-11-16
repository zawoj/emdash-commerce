import type { LinkContent } from '../../../types/link'
import type { SelectOption } from '../../atoms/select/index.astro'
import type { ActiveFilter } from '../active-filters/types'

export interface ListingSort {
  readonly id: string
  /** The select's name (`sort`). */
  readonly name: string
  readonly label: string
  readonly options: readonly SelectOption[]
  readonly value?: string
  /** Text of the apply button shown only without a script. */
  readonly submitLabel: string
}

/** The button that opens the filter panel. */
export interface ListingFiltersButton {
  readonly label: string
  /** The id of the filter panel (a `ListingFilters` dialog) it opens. */
  readonly controls: string
  /** How many filters are applied: the badge; hidden at 0. */
  readonly activeCount: number
  /** Spoken after the badge number ("applied"): `Filters 3 applied`. */
  readonly activeCountLabel?: string
}

export interface ListingToolbarProps {
  /** Where the sort form submits (the listing's own URL). */
  action: string
  sort: ListingSort
  /** The query parameters the sort form must keep (the category, the filters) as hidden fields. */
  keep?: Readonly<Record<string, string | readonly string[]>>
  /** The Filters button; without it the toolbar is the sort alone. */
  filters?: ListingFiltersButton
  /** The applied filters as removable chips after the button; one scrolling line on a phone. */
  activeFilters?: readonly ActiveFilter[]
  /** Names the chip list ("Applied filters"). */
  activeFiltersLabel?: string
  /** Drops every applied filter; shown after the chips. */
  clearAll?: LinkContent
}
