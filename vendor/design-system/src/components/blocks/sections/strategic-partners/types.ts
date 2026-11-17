import type { ImageAttrs } from '../../../../types/image'

/** One logo of the strip: the partner's name stands in for a logo without alt text. */
export interface StrategicPartnerLogo {
  readonly name: string
  readonly logo: ImageAttrs
  /** The partner's own website, linked as a sponsored link. */
  readonly href?: string
}

export interface StrategicPartnersProps {
  heading: string
  /** Labels the strip; unique per page. */
  headingId: string
  partners: readonly StrategicPartnerLogo[]
}
