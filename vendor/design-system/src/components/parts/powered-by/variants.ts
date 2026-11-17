// Where a "powered by" partner credit renders: `heading` = inside a content-tile's title row
// (hidden once the tile is narrow), `row` = its own row under the title (shown only when narrow),
// `standalone` = always shown where it is placed.
export const creditPlacements = {
  heading: 'heading',
  row: 'row',
  standalone: 'standalone',
} as const
export type CreditPlacement = (typeof creditPlacements)[keyof typeof creditPlacements]
