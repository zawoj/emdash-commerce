import type { ImageAttrs } from '../../../../types/image'

/** The partner's discount banner. */
export interface DiscountBannerProps {
  /** The discount's cover; without it only the message shows. */
  readonly image?: ImageAttrs
  /** Shown under the banner while the discount is not on (paused, expired or archived). */
  readonly message?: string
  /** Position of the block on the page; only the first block may load its image eagerly. */
  readonly index?: number
}
