// Color axis — Figma's button is gray/800 (`primary`); page instances override it to the accent
// orange (`accent`) or white (`inverse`).
export const buttonVariants = {
  primary: 'primary',
  accent: 'accent',
  inverse: 'inverse',
  /** A quiet secondary action on a light page: transparent with a hairline. */
  outline: 'outline',
} as const
export type ButtonVariant = (typeof buttonVariants)[keyof typeof buttonVariants]

// Size axis — Figma button "Size": sm (40px, button-sm, 16px icon) and lg (48px, button-lg, 20px
// icon).
export const buttonSizes = {
  sm: 'sm',
  lg: 'lg',
} as const
export type ButtonSize = (typeof buttonSizes)[keyof typeof buttonSizes]

// Kind axis — Figma button "Icon": `default` = Icon=No (label centered; the `icon` slot is optional)
// and `cta` = Icon=Yes (a 240px button, label and trailing arrow pushed apart; the icon box is
// always reserved). A `cta` without `size` is lg.
export const buttonKinds = {
  default: 'default',
  cta: 'cta',
} as const
export type ButtonKind = (typeof buttonKinds)[keyof typeof buttonKinds]
