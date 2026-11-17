// Look axis of the discounts block: `row` = Figma "Frame 481314" (home 944:29579), deal cards side
// by side in the page's zones; `stack` = the cards one under another in a bar (sidebar 833:44024).
export const discountsVariants = {
  row: 'row',
  stack: 'stack',
} as const
export type DiscountsVariant = (typeof discountsVariants)[keyof typeof discountsVariants]

// How many deal cards each look shows. The data layer reads it to size its query; the look lays
// out whatever it is given.
export const DISCOUNTS_LIMITS = {
  [discountsVariants.row]: 3,
  [discountsVariants.stack]: 3,
} as const satisfies Record<DiscountsVariant, number>
