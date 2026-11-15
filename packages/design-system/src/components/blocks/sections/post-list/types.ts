import type { PostListRhythm, PostListSearchSize, PostListPaginationTone } from './variants'
import type { LinkContent } from '../../../../types/link'
import type { ArticleCardContent } from '../../../parts/article-card/types'
import type { PaginationBarLabels } from '../../../parts/pagination-bar/types'

export interface PostListOption {
  readonly label: string
  readonly value: string
}

/** Figma "search" (787:33501, strona / filled): the query field, an optional type filter and the sort. */
export interface PostListSearch {
  /** Where the form submits (GET). */
  readonly action: string
  readonly query: string
  readonly queryLabel: string
  readonly queryPlaceholder: string
  readonly sortLabel: string
  readonly sortOptions: readonly PostListOption[]
  readonly sortValue: string
  /** A type select before the sort; the category, tag and author archives have none. */
  readonly filter?: {
    readonly label: string
    readonly name: string
    readonly options: readonly PostListOption[]
    readonly value: string
  }
}

/** Figma "pagination": page `currentPage` of `totalPages` plus the results line. */
export interface PostListPagination {
  readonly currentPage: number
  readonly totalPages: number
  readonly resultsLabel: string
  readonly labels: PaginationBarLabels
  /** The address of page `page`. */
  readonly pageHref: (page: number) => string
}

/** One titled tile of cards — the search results come grouped by type. */
export interface PostListGroup {
  /** Unique within the list; prefixes the heading's id. */
  readonly id: string
  readonly heading: string
  readonly items: readonly ArticleCardContent[]
  /** The tile's link on the right of its heading ("show all"). */
  readonly more?: LinkContent
}

export interface PostListProps {
  /** Names the article grid for assistive technology. */
  label: string
  /** Prefixes the search form's field ids; unique per page. */
  idPrefix: string
  search: PostListSearch
  items: readonly ArticleCardContent[]
  /** When given, the cards are shown in one titled tile per group instead of the single grid of `items`. */
  groups?: readonly PostListGroup[]
  /** Shown instead of the grid when there are no items (or no group). */
  emptyLabel: string
  pagination: PostListPagination
  rhythm?: PostListRhythm
  searchSize?: PostListSearchSize
  paginationTone?: PostListPaginationTone
}
