import type { BrandMarqueeTone } from './variants'

/** A full-bleed band with one slogan scrolling slowly past in condensed caps. */
export interface BrandMarqueeProps {
  /** The line that repeats ("TRAIN HARD — GO FAR"); screen readers read it once. */
  readonly text: string
  readonly tone?: BrandMarqueeTone
}
