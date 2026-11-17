// YouTube tile placement: `main` = the main column, `sidebar` = the 360px right-bar widget. Sets
// the padding.
export const youtubeTileSizes = {
  main: 'main',
  sidebar: 'sidebar',
} as const
export type YoutubeTileSize = (typeof youtubeTileSizes)[keyof typeof youtubeTileSizes]
