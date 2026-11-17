// Size axis — `m` = the 20px day of Figma's event tables and lists; `l` = the 24px day the home
// hero's event cards use on the same 56x56 tile.
export const dateBadgeSizes = {
  m: 'm',
  l: 'l',
} as const
export type DateBadgeSize = (typeof dateBadgeSizes)[keyof typeof dateBadgeSizes]
