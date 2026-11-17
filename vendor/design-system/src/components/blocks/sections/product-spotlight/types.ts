import type { ImageAttrs } from '../../../../types/image'
import type { LinkContent } from '../../../../types/link'
import type { CalloutSide } from './variants'

/** One annotation on the photo: a numbered marker at a point, with a hairline leader to its label. */
export interface SpotlightCallout {
  /** Short caps label ("Cushion"); the number is added by the component. */
  readonly title: string
  /** One line about that part. */
  readonly text: string
  /** Marker position in percent of the photo's width / height. */
  readonly x: number
  readonly y: number
  readonly side?: CalloutSide
}

export interface SpotlightSpec {
  readonly label: string
  readonly value: string
}

/** One product as a technical feature: an annotated photo and a side panel with the facts and the buy link. */
export interface ProductSpotlightProps {
  /** The product name, the section's heading. */
  heading: string
  headingId?: string
  eyebrow?: string
  image: ImageAttrs
  callouts: readonly SpotlightCallout[]
  /** Names the list of callouts for screen readers. */
  calloutsLabel: string
  price: string
  /** The reduced-from price, struck through. */
  compareAtPrice?: string
  /** Three short spec rows read best. */
  specs: readonly SpotlightSpec[]
  cta: LinkContent
  secondary?: LinkContent
}
