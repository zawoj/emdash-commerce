import type { ImageAttrs } from '../../../../types/image'
import type { LinkContent } from '../../../../types/link'

export interface ReviewWallReview {
  readonly quote: string
  readonly author: string
  /** Extra context after the name ("Verified buyer", "Warsaw"). */
  readonly meta?: string
  readonly rating: { readonly value: number; readonly label: string }
  /** The product the review is about. */
  readonly product?: LinkContent
  /** A photo from the customer. */
  readonly photo?: ImageAttrs
}

/** "Customer favourites": the shop's average rating and a handful of reviews, the first one featured. */
export interface ReviewWallProps {
  readonly heading: string
  /** Labels the section; unique per page. */
  readonly headingId?: string
  readonly eyebrow?: string
  /** The headline stat. */
  readonly summary: {
    /** The average as printed ("4.8"). */
    readonly scoreLabel: string
    readonly value: number
    /** Spoken text of the stars ("4.8 out of 5"). */
    readonly label: string
    /** The count line ("from 1,284 reviews"). */
    readonly countLabel: string
  }
  /** The first review is the large one; show 3–4 in all. */
  readonly reviews: readonly ReviewWallReview[]
  readonly cta: LinkContent
}
