// How a text tile of the bento is filled: the brand volt, or black.
export const collectionTileTones = {
  volt: 'volt',
  dark: 'dark',
} as const
export type CollectionTileTone = (typeof collectionTileTones)[keyof typeof collectionTileTones]

/** Tiles the bento lays out: one large, one wide, two small. */
export const COLLECTION_BENTO_SLOTS = ['large', 'wide', 'small', 'small'] as const
export type CollectionBentoSlot = (typeof COLLECTION_BENTO_SLOTS)[number]
