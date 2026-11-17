// Size axis — Figma "search" (787:33503) Property 1: `l` = strona (article search / category
// listings: 40px radius-md controls) and `m` = zawody (event search: 34px radius-sm controls).
export const searchBarSizes = {
  l: 'l',
  m: 'm',
} as const
export type SearchBarSize = (typeof searchBarSizes)[keyof typeof searchBarSizes]
