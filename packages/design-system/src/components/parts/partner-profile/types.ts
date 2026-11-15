import type { ImageAttrs } from '../../../types/image'
import type { LinkContent } from '../../../types/link'

/** The fixed content of a partner page: the pictures and the link to the brand's website; the text, the offer and the posts are slots. */
export interface PartnerProfileProps {
  /** The page's main picture; kept in the cover proportion (1280 × 762). */
  readonly cover?: ImageAttrs
  /** The partner's logo, drawn as one monochrome mark in a frame beside the text. */
  readonly logo?: ImageAttrs
  /** The brand's official website. */
  readonly website?: LinkContent
}
