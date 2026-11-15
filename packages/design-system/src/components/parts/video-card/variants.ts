// Figma video "Link" card geometry: `compact` = 234px card of the main-column row, `wide` = 312px
// card of the sidebar tile.
export const videoCardSizes = {
  compact: 'compact',
  wide: 'wide',
} as const
export type VideoCardSize = (typeof videoCardSizes)[keyof typeof videoCardSizes]
