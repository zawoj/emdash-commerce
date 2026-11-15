// How many posts the "Kategoria: ciemny kafel" tile shows: two horizontal feature cards, then a
// row of four small ones. The data layer reads these to size its query.
export const CATEGORY_DARK_TILE_FEATURE_COUNT = 2
export const CATEGORY_DARK_TILE_ITEM_COUNT = 4

// A feature card's photo: about half of the tile's 960px content (468px), the card going vertical
// on a narrow tile.
export const CATEGORY_DARK_TILE_FEATURE_IMAGE_SIZES = [
  '(min-width: 1440px) 471px',
  '(min-width: 900px) calc((100vw - 504px) / 2)',
  '(min-width: 641px) calc((100vw - 120px) / 2)',
  'calc(100vw - 80px)',
].join(', ')

// The small cards share the "Najnowsze" grid geometry: four columns, two below 760px of tile, a
// 120px thumbnail row below 420px.
export const CATEGORY_DARK_TILE_ITEM_IMAGE_SIZES = [
  '(min-width: 1440px) 222px',
  '(min-width: 1192px) calc((100vw - 552px) / 4)',
  '(min-width: 900px) calc((100vw - 504px) / 2)',
  '(min-width: 808px) calc((100vw - 168px) / 4)',
  '(min-width: 641px) calc((100vw - 120px) / 2)',
  '(min-width: 452px) calc((100vw - 104px) / 2)',
  '120px',
].join(', ')
