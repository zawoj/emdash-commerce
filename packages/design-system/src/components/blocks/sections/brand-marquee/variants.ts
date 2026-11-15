// The band's colours: `volt` = the brand fill with black type, `dark` = the black band, `light` = the quiet grey band.
export const brandMarqueeTones = {
  light: 'light',
  volt: 'volt',
  dark: 'dark',
} as const
export type BrandMarqueeTone = (typeof brandMarqueeTones)[keyof typeof brandMarqueeTones]

/** How often the line repeats in one loop; enough to fill an ultra-wide screen. */
export const BRAND_MARQUEE_REPEATS = 8
