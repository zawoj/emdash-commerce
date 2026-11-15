// The featured post's photo is a fixed 623px beside the text column; below the two-column page
// width (1100px) it spans the tile, which still sits beside the 360px sidebar down to 900px.
export const FEATURED_POST_IMAGE_SIZES = [
  '(min-width: 1101px) 623px',
  '(min-width: 901px) calc(100vw - 432px)',
  '(min-width: 641px) calc(100vw - 48px)',
  'calc(100vw - 32px)',
].join(', ')
