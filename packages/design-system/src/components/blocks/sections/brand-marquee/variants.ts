// The band's colours: `volt` (legacy name, kept for the prop) = the accent ink fill with white type, `dark` = the dark band, `light` = the quiet muted band.
export const brandMarqueeTones = {
  light: 'light',
  volt: 'volt',
  dark: 'dark',
} as const
export type BrandMarqueeTone = (typeof brandMarqueeTones)[keyof typeof brandMarqueeTones]

