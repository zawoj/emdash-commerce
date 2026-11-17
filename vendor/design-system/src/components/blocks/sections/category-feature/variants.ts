// How many posts the "category: 2 large + 4 small" tile shows: a row of two large cards, then a row
// of four small ones. The data layer reads these to size its query; the tile lays out whatever it
// is given.
export const CATEGORY_FEATURE_LEAD_COUNT = 2
export const CATEGORY_FEATURE_ITEM_COUNT = 4

// The large cards' rendered width: the tile's 960px content (main column 1008px minus 24px
// padding each side) in two columns with a 24px gutter, next to the 360px sidebar (24px gutter,
// 24px page padding), the sidebar dropping under the column below 900px; a single column below
// 420px of tile.
export const CATEGORY_FEATURE_LEAD_IMAGE_SIZES = [
  '(min-width: 1440px) 468px',
  '(min-width: 900px) calc((100vw - 504px) / 2)',
  '(min-width: 641px) calc((100vw - 120px) / 2)',
  '(min-width: 452px) calc((100vw - 104px) / 2)',
  'calc(100vw - 80px)',
].join(', ')

// The small cards' rendered width: four columns, then two below 760px of tile, then a 120px
// thumbnail row below 420px.
export const CATEGORY_FEATURE_ITEM_IMAGE_SIZES = [
  '(min-width: 1440px) 222px',
  '(min-width: 1192px) calc((100vw - 552px) / 4)',
  '(min-width: 900px) calc((100vw - 504px) / 2)',
  '(min-width: 808px) calc((100vw - 168px) / 4)',
  '(min-width: 641px) calc((100vw - 120px) / 2)',
  '(min-width: 452px) calc((100vw - 104px) / 2)',
  '120px',
].join(', ')
