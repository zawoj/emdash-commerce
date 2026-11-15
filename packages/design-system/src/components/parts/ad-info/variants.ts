// Figma "ad-info" layout: `default` = centred 12px caption ("General ad info"), `horizontal` /
// `vertical` = 14px caption beside / above a partner logo ("Partner zdrowie / trening").
export const adInfoLayouts = {
  default: 'default',
  horizontal: 'horizontal',
  vertical: 'vertical',
} as const
export type AdInfoLayout = (typeof adInfoLayouts)[keyof typeof adInfoLayouts]
