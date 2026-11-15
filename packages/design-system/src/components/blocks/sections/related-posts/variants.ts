// How many posts the "related" tile shows: one row of three. The data layer reads it to size its
// query; the tile lays out whatever it is given.
export const RELATED_POSTS_ITEM_COUNT = 3

// The cards' rendered width: three columns in the compact tile (20px padding and gutters) across
// the 1200px article band, one column below 640px of tile; the band sits in the main column
// beside the sidebar between 1100px and 1279px.
export const RELATED_POSTS_IMAGE_SIZES = [
  '(min-width: 1440px) 380px',
  '(min-width: 1280px) calc((100vw - 144px) / 3)',
  '(min-width: 1100px) calc((100vw - 504px) / 3)',
  '(min-width: 700px) calc((100vw - 144px) / 3)',
  'calc(100vw - 72px)',
].join(', ')
