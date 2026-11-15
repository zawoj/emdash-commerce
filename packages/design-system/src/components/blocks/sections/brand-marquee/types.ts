import type { BrandMarqueeTone } from './variants'

/** A full-bleed static band with one slogan. */
export interface BrandMarqueeProps {
  /** The slogan line. */
  readonly text: string
  readonly tone?: BrandMarqueeTone
}
