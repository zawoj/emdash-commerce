// Shape axis — `round` is the circular-button row (buttons on the surface's muted fill); `square` is the page footer's row (32px rounded squares, muted glyphs).
export const socialLinksVariants = {
  round: 'round',
  square: 'square',
} as const
export type SocialLinksVariant = (typeof socialLinksVariants)[keyof typeof socialLinksVariants]
