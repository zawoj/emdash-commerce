export interface PaginationBarLabels {
  /** Names the pagination landmark. */
  nav: string
  previous: string
  next: string
}

export interface PaginationBarProps {
  currentPage: number
  totalPages: number
  /** The line under the page numbers ("Wyniki: 1–50 z 740"). */
  resultsLabel: string
  labels: PaginationBarLabels
  /** The address of page `page`; the caller owns the URL scheme. */
  pageHref: (page: number) => string
}
