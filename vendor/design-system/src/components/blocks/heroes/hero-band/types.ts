import type { HeroBandDescriptionWeight, HeroBandVariant } from './variants'
import type { ImageAttrs } from '../../../../types/image'
import type { CategoryRef } from '../../../atoms/category-label/types'

/** Figma 1023:67103: the strategic-partner tile under the description. */
export interface HeroBandPartner {
  readonly caption: string
  readonly name: string
  /** Without a logo the tile shows the partner's name. */
  readonly logo?: ImageAttrs
  /** The partner's own website, linked as a sponsored link; without it the tile is not a link. */
  readonly href?: string
}

/**
 * Figma "section" > "container" of a listing hero. With `category` the band takes the category
 * colour and carries the inverted Category Label; without it the band is the dark one.
 */
export interface HeroBandProps {
  readonly title: string
  /** Labels the section (the title's id); unique per page. */
  readonly headingId?: string
  /** Justified copy; runs joined by U+00A0 keep their natural width. */
  readonly description?: string
  readonly category?: CategoryRef
  readonly partner?: HeroBandPartner
  readonly descriptionWeight?: HeroBandDescriptionWeight
  readonly variant?: HeroBandVariant
}
