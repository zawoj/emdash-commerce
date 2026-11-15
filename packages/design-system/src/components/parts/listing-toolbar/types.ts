import type { LinkContent } from '../../../types/link'
import type { SelectOption } from '../../atoms/select/index.astro'

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

export interface ListingToolbarProps {
  /** The result count in words ("24 products"); a polite live region so a filter change is announced. */
  resultCount: string
  /** Where the sort form submits (the listing's own URL). */
  action: string
  sort: ListingSort
  /** The query parameters the sort form must keep (the active filters, the search term) as hidden fields. */
  keep?: Readonly<Record<string, string | readonly string[]>>
  /** A link to the filter panel (`#<id>`), shown on a phone only; the script opens the panel. */
  filterToggle?: LinkContent
}
