import type { WidgetHeading } from '../../../types/heading'

export interface SocialChannel {
  readonly label: string
  readonly value: string
  readonly href: string
  readonly icon: string
  /** Icon offset from the card's padding box (right / top edge) — Figma lifts the Facebook glyphs 1–2px. */
  readonly iconRight: number
  readonly iconTop: number
}

/** Figma "tile-socials-widget-R": a 2×2 grid of channel cards. */
export interface SocialsWidgetContent extends WidgetHeading {
  readonly channels: readonly SocialChannel[]
}
