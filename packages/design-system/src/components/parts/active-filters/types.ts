import type { LinkContent } from '../../../types/link'

/** An applied filter as a removable chip; `removeHref` is the listing URL without it. */
export interface ActiveFilter {
  readonly label: string
  readonly removeHref: string
  /** Accessible name of the remove link ("Remove filter: Black"). */
  readonly removeLabel: string
}

export interface ActiveFiltersProps {
  /** Names the list for assistive tech ("Applied filters"). */
  label: string
  filters: readonly ActiveFilter[]
  /** Drops every filter; shown after the chips. */
  clearAll?: LinkContent
  /** One horizontally scrolling line on a phone (it runs to the page edge); otherwise the chips wrap. */
  isScrolling?: boolean
}
