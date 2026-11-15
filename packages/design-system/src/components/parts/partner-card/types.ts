import type { ImageAttrs } from '../../../types/image'

/** One partner on the partners list: the brand's logo, its name and short description, and the way to its page. */
export interface PartnerCardContent {
  readonly name: string
  readonly description?: string
  /** The partner's logo, drawn as one monochrome mark; the frame stays empty without one. */
  readonly logo?: ImageAttrs
  /** The partner page. */
  readonly href: string
  readonly ctaLabel: string
}
