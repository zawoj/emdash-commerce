// How many posts each tile of "Dwie kategorie" shows: a lead article and a list of compact ones.
// The data layer reads these to size its queries; a tile lays out whatever it is given.
export const CATEGORY_PAIR_LEAD_COUNT = 1
export const CATEGORY_PAIR_LIST_COUNT = 3

// The lead photo's rendered width: half of the tile's 960px content (a 24px gutter between the two
// tiles), the sidebar dropping under the column below 900px and the tiles stacking below 640px.
export const CATEGORY_PAIR_LEAD_IMAGE_SIZES = [
  '(min-width: 1440px) 448px',
  '(min-width: 900px) calc((100vw - 528px) / 2)',
  '(min-width: 641px) calc((100vw - 144px) / 2)',
  'calc(100vw - 80px)',
].join(', ')

// The list rows' 104px thumbnail.
export const CATEGORY_PAIR_LIST_IMAGE_SIZES = '104px'
