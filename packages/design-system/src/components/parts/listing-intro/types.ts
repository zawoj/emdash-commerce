import type { ImageAttrs } from '../../../types/image'

/** The opening of a listing page: the H1, an optional intro text and an optional picture (a brand's logo). */
export interface ListingIntroProps {
  readonly heading: string
  readonly headingId?: string
  /** The intro as paragraphs. */
  readonly intro?: readonly string[]
  readonly image?: ImageAttrs
}
