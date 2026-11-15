// How many posts the "Najnowsze" grid shows: two rows of four. The data layer reads it to size its
// query; the grid lays out whatever it is given.
export const LATEST_POSTS_LIMIT = 8

// The cover's rendered width for the grid's placement: the 1008px main column of the page next to
// the 360px sidebar (24px gutter, 24px tile padding), the sidebar dropping under the column below
// 900px. The tile switches from four columns to two below its --tile-breakpoint-xl (760px) and to a
// 120px thumbnail row below --tile-breakpoint-xs (420px); every calc() below is the card width at
// that viewport range.
export const LATEST_POSTS_IMAGE_SIZES = [
  '(min-width: 1440px) 222px',
  '(min-width: 1192px) calc((100vw - 552px) / 4)',
  '(min-width: 900px) calc((100vw - 504px) / 2)',
  '(min-width: 808px) calc((100vw - 168px) / 4)',
  '(min-width: 641px) calc((100vw - 120px) / 2)',
  '(min-width: 452px) calc((100vw - 104px) / 2)',
  '120px',
].join(', ')
