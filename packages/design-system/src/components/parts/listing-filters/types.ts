import type { LinkContent } from '../../../types/link'

export interface FilterOption {
  readonly value: string
  readonly label: string
  /** How many results the option leaves; shown in brackets and read out. */
  readonly count?: number
  readonly isChecked?: boolean
  /** A chip option with no stock stays selectable and is labelled. */
  readonly isSoldOut?: boolean
}

interface FilterGroupBase {
  /** Prefix of the group's control ids. */
  readonly id: string
  readonly label: string
  /** Groups are open by default; set false to start one collapsed. */
  readonly isOpen?: boolean
}

export interface CheckboxFilterGroup extends FilterGroupBase {
  readonly kind: 'checkbox'
  /** The query parameter every option's checkbox submits under (repeated). */
  readonly name: string
  readonly options: readonly FilterOption[]
}

export interface ChipsFilterGroup extends FilterGroupBase {
  readonly kind: 'chips'
  readonly name: string
  readonly options: readonly FilterOption[]
  readonly soldOutLabel?: string
}

export interface RangeBound {
  readonly name: string
  /** Accessible name of the input ("Price from"). */
  readonly label: string
  readonly placeholder?: string
  readonly value?: number
}

export interface RangeFilterGroup extends FilterGroupBase {
  readonly kind: 'range'
  readonly min: RangeBound
  readonly max: RangeBound
  /** The unit shown after the inputs ("zł"). */
  readonly unit?: string
}

export type FilterGroup = CheckboxFilterGroup | ChipsFilterGroup | RangeFilterGroup

/** An applied filter as a removable chip; `removeHref` is the listing URL without it. */
export interface ActiveFilter {
  readonly label: string
  readonly removeHref: string
  /** Accessible name of the remove link ("Remove filter: Black"). */
  readonly removeLabel: string
}

export interface ListingFiltersProps {
  /** The panel's id: the toolbar's filter link targets `#<id>`. */
  id: string
  /** The listing's URL; the form submits there with GET. */
  action: string
  /** The panel's heading ("Filters"). */
  title: string
  groups: readonly FilterGroup[]
  activeFilters?: readonly ActiveFilter[]
  /** Drops every filter. */
  clearAll?: LinkContent
  /** Parameters that survive applying filters (the search term, the sort). */
  keep?: Readonly<Record<string, string>>
  /** Text of the apply button; hidden when the script submits on change. */
  submitLabel: string
  /** Heading of the active-filter row ("Active filters"), spoken. */
  activeLabel?: string
  /** Prefix of the count in brackets read out for an option ("results"): `Black (12 results)`. */
  countLabel?: string
  /** Phone: the button fixed at the bottom of the open panel ("Show results (24)"); it folds the panel and shows the results. */
  resultsLabel?: string
}
