// Figma "tile-ad" placement: `main` = creative scales with the slot, one-line caption; `sidebar` =
// fixed-height creative, caption in Figma's 299px box (two lines).
export const adTilePlacements = {
  main: 'main',
  sidebar: 'sidebar',
} as const
export type AdTilePlacement = (typeof adTilePlacements)[keyof typeof adTilePlacements]
