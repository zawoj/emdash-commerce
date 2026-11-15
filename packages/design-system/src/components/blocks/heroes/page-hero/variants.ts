// Where a `PageHero` sets its text: `start` = flush with the column's left edge, `center` = centred.
export const pageHeroAlignments = {
  start: 'start',
  center: 'center',
} as const
export type PageHeroAlignment = (typeof pageHeroAlignments)[keyof typeof pageHeroAlignments]

// The hero's surface: `light` = the page surface with a 1px outline, `dark` = the dark ink band.
export const pageHeroTones = {
  light: 'light',
  dark: 'dark',
} as const
export type PageHeroTone = (typeof pageHeroTones)[keyof typeof pageHeroTones]
