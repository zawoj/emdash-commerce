// Figma "tile" surface: white, or black with the text tokens flipped through `data-surface`.
export const tileSurfaces = {
  light: 'light',
  dark: 'dark',
} as const
export type TileSurface = (typeof tileSurfaces)[keyof typeof tileSurfaces]

// Figma "tile" padding: `regular` = 32px top/bottom, 24px sides (tile tokens); `compact` = 20px all
// round (the article's bottom "related" tile 944:33280).
export const tilePaddings = {
  regular: 'regular',
  compact: 'compact',
} as const
export type TilePadding = (typeof tilePaddings)[keyof typeof tilePaddings]
