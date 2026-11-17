import type { DealCardContent } from '../deal-card/types'

/** One select of the search bar. */
export interface DealGridSelect {
  readonly id: string
  readonly name: string
  readonly ariaLabel: string
  readonly options: readonly { readonly label: string; readonly value: string }[]
  readonly value?: string
}

/** Figma 1017:40838 "section" (deals listing): the search form over the grid of deal cards. */
export interface DealGridProps {
  /** Where the form submits (GET). */
  action: string
  /** Names the section for assistive technology. */
  label: string
  search: {
    readonly id: string
    readonly name: string
    readonly placeholder: string
    readonly ariaLabel: string
    readonly value?: string
  }
  filterLabel: string
  filters: readonly DealGridSelect[]
  sortLabel: string
  sort: DealGridSelect
  deals: readonly DealCardContent[]
  /** Shown instead of the grid when there is no deal. */
  emptyLabel: string
}
