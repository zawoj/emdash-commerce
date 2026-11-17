// Variant vocabularies of the page grid.

/** The page personalities: `feed` (home, listings, plain pages: bands on top, a feed with a sidebar),
 * `article` (a record's page: title and photo on top, a rail, the text and a sidebar) and `deal` (a
 * partner's discount page: the banner on top, then the offer bar | the text | the sidebar in 360 | 672 | 360). */
export const pageGridVariants = {
  feed: 'feed',
  article: 'article',
  deal: 'deal',
} as const
export type PageGridVariant = (typeof pageGridVariants)[keyof typeof pageGridVariants]

/** Where the left bar sits when the page is one column: before the text or after the bottom zone. */
export const pageGridLeftOrders = {
  before: 'before',
  after: 'after',
} as const
export type PageGridLeftOrder = (typeof pageGridLeftOrders)[keyof typeof pageGridLeftOrders]

