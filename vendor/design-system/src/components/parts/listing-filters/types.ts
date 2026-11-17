import type { LinkContent } from '../../../types/link'
export type { ActiveFilter } from '../active-filters/types'

export interface FilterOption {
  /** What the control submits. */
  readonly value: string
  readonly label: string
  /** How many results the option leaves next to the other applied filters. */
  readonly count?: number
  readonly isChecked?: boolean
}

interface FilterGroupBase {
  /** Prefix of the group's control ids. */
  readonly id: string
  /** The group's legend. */
  readonly label: string
  /** The query parameter every option submits under. */
  readonly name: string
}

export interface SwitchFilterGroup extends FilterGroupBase {
  readonly kind: 'switch'
  readonly option: FilterOption
}

export interface CheckboxFilterGroup extends FilterGroupBase {
  readonly kind: 'checkbox'
  readonly options: readonly FilterOption[]
}

export interface ChipsFilterGroup extends FilterGroupBase {
  readonly kind: 'chips'
  readonly options: readonly FilterOption[]
}

export interface SegmentedFilterGroup extends FilterGroupBase {
  readonly kind: 'segmented'
  readonly options: readonly FilterOption[]
}

export type FilterGroup = SwitchFilterGroup | CheckboxFilterGroup | ChipsFilterGroup | SegmentedFilterGroup

export interface ListingFiltersResults {
  /** The button's text for the current count ("Show 12 results"). */
  readonly label: string
  /**
   * The button's text per plural category (`one`, `few`, `many`, `other`, and `zero` for no results at all), each
   * with a `{count}` placeholder: the script picks one when the count changes while the panel is open.
   */
  readonly forms?: Readonly<Record<string, string>>
}

export interface ListingFiltersProps {
  /** The panel's id: the toolbar's Filters button points at it. */
  id: string
  /** The listing's URL; the form submits there with GET. */
  action: string
  /** The panel's heading ("Filters"). */
  title: string
  /** Accessible name of the close button ("Close filters"). */
  closeLabel: string
  groups: readonly FilterGroup[]
  /** Parameters that survive applying filters (the category, the sort). */
  keep?: Readonly<Record<string, string>>
  /** Drops every filter ("Clear all"). */
  clearAll: LinkContent
  /** The primary button at the foot: it applies the choices and says how many results they leave. */
  results: ListingFiltersResults
  /** Said after an option's count ("results"): `Black 12 results`. */
  countLabel?: string
}
