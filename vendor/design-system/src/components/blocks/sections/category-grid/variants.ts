// How many posts the "Kategoria: siatka 6" tile shows: two rows of three. The data layer reads it
// to size its query; the grid lays out whatever it is given.
export const CATEGORY_GRID_ITEM_COUNT = 6

// The cards' rendered width: three columns in the tile's 960px content (24px gutters) next to the
// 360px sidebar, two columns below 640px of tile, a 120px thumbnail row below 420px; the sidebar
// drops under the column below 900px.
export const CATEGORY_GRID_IMAGE_SIZES = [
  '(min-width: 1440px) 304px',
  '(min-width: 1192px) calc((100vw - 528px) / 3)',
  '(min-width: 900px) calc((100vw - 504px) / 2)',
  '(min-width: 808px) calc((100vw - 144px) / 3)',
  '(min-width: 641px) calc((100vw - 120px) / 2)',
  '(min-width: 452px) calc((100vw - 104px) / 2)',
  '120px',
].join(', ')
