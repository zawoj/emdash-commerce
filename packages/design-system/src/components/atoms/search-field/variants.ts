// Size axis — `m` = Figma's zawody search field (34px, radius-sm); `l` = the strona search field
// (40px, radius-md; also the category listing's search row).
export const searchFieldSizes = {
  m: 'm',
  l: 'l',
} as const
export type SearchFieldSize = (typeof searchFieldSizes)[keyof typeof searchFieldSizes]
