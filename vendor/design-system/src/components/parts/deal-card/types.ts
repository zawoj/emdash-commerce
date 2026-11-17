import type { ImageAsset } from '../../../types/asset'

/** Figma "card-deal". */
export interface DealCardContent {
  readonly partnerName: string
  /** One entry per line — Figma breaks deal titles with hard line breaks. */
  readonly titleLines: readonly string[]
  readonly description: string
  readonly ctaLabel: string
  /** The offer's link; the card has no button without one. */
  readonly href?: string
  /** The photo; the frame stays empty without one. */
  readonly image?: string
  /** Partner brand mark watermarked (white) over the centre of the photo. */
  readonly partnerMark?: ImageAsset
  /** `detail` card only (article): the "how to redeem" block. */
  readonly howTo?: DealHowTo
  /** `detail` card only (article): the discount code shown in the copy field. */
  readonly code?: string
}

/** Figma "Frame 481281" of the detail card-deal: a heading over the redemption instructions. */
export interface DealHowTo {
  readonly heading: string
  readonly body: string
  /** Accessible label of the code field's copy button. */
  readonly copyLabel: string
}
