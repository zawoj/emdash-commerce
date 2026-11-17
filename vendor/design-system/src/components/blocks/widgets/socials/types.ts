import type { SocialChannelKey } from './variants'

export interface SocialsChannel {
  /** Picks the card's glyph. */
  readonly key: SocialChannelKey
  readonly label: string
  /** The follower count as it should read, e.g. "65k". */
  readonly value: string
  readonly href: string
}

/** Figma "tile-socials-widget-R": a card per channel, in the Figma order. */
export interface SocialsProps {
  readonly heading: string
  /** Labels the tile's section; unique per page. */
  readonly headingId?: string
  readonly channels: readonly SocialsChannel[]
}
