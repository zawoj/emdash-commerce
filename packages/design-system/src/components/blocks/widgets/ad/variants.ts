// Room kept for the caption under a creative while the slot waits for the script to pick one, so
// the page does not shift when the creative appears.
export const AD_SLOT_CAPTION_ALLOWANCE = 44

// The creative's rendered width per placement, for its `sizes` attribute: the 1008px main column of
// the page next to the 360px sidebar (24px gutter, 24px page padding on each side), the sidebar
// dropping under the column below 900px; the sidebar slot is the sidebar's 360px.
export const AD_IMAGE_SIZES = {
  main: '(min-width: 1440px) 1008px, (min-width: 900px) calc(100vw - 432px), calc(100vw - 48px)',
  sidebar: '(min-width: 900px) 360px, calc(100vw - 48px)',
} as const

// The width a creative is drawn at per placement (Figma "tile-ad": the 1008px main column, the 360px
// sidebar). A creative is uploaded at any size; the data layer states its box at this width, keeping
// its aspect ratio, so the slot's height follows the image instead of the file's pixel size.
export const AD_SLOT_WIDTHS = {
  main: 1008,
  sidebar: 360,
} as const
