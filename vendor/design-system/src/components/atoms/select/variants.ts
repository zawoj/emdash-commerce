// Size axis — `m` = Figma's zawody search-bar select (34px, radius-sm); `l` = the strona search
// bar's 40px radius-md select (also the category listing's filter tiles).
export const selectSizes = {
  m: 'm',
  l: 'l',
} as const
export type SelectSize = (typeof selectSizes)[keyof typeof selectSizes]
