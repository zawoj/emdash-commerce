import type { DisplayDate } from '../../../types/date'

export interface ReviewItem {
  readonly id: string
  /** The stars, 1–5. */
  readonly ratingValue: number
  /** The stars' accessible text ("4 out of 5"). */
  readonly ratingLabel: string
  readonly title?: string
  /** Plain text; line breaks start new paragraphs. */
  readonly body: string
  /** "Anna K."; empty is allowed (the caller says "Customer"). */
  readonly author: string
  readonly date: DisplayDate
  readonly isVerified: boolean
  /** The shop's answer. */
  readonly reply?: string
}

export interface ReviewSortOption {
  readonly label: string
  readonly href: string
  readonly isCurrent: boolean
}

export interface ReviewListProps {
  reviews: readonly ReviewItem[]
  /** Names the list ("Customer reviews"). */
  label: string
  /** The badge of a review from a delivered order ("Verified purchase"). */
  verifiedLabel: string
  /** The heading of the shop's answer ("Reply from the shop"). */
  replyLabel: string
  /** The sort links; omitted when there is nothing to sort. */
  sort?: { readonly label: string; readonly options: readonly ReviewSortOption[] }
  /** Shown instead of the list when there are no reviews. */
  empty: { readonly title: string; readonly text: string }
  /** Spoken after a sort option's label when it is the current one ("selected"). */
  currentLabel?: string
}
