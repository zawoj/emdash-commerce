// Size axis — Figma tile-title "Title Size": `l` = Large (display-sm 24/26, width axis 68, main
// tiles), `s` = Small (Side) (display-xs 20/22, width axis 70, balanced — sidebar tiles).
export const tileTitleSizes = {
  l: 'l',
  s: 's',
} as const
export type TileTitleSize = (typeof tileTitleSizes)[keyof typeof tileTitleSizes]

// Color axis — Figma tile-title "Color": `default` = Black / onDarkBg (follows the surface theme),
// `hot` = Red (accent/red-dark, the "hot" tile with the fire glyph before the heading).
export const tileTitleTones = {
  default: 'default',
  hot: 'hot',
} as const
export type TileTitleTone = (typeof tileTitleTones)[keyof typeof tileTitleTones]
