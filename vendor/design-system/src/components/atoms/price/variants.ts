// Size of a `Price`: `md` = the card's price line, `lg` = the product page's headline price.
export const priceSizes = {
  md: 'md',
  lg: 'lg',
} as const
export type PriceSize = (typeof priceSizes)[keyof typeof priceSizes]
