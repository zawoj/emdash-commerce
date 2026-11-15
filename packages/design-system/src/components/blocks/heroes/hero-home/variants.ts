// How many articles the home hero shows: up to five slides in the lead slider and four cards in the
// "hot" tile (two rows of two). The data layer reads them to size its queries; the layout
// shows whatever it is given.
export const HERO_HOME_SLIDES_LIMIT = 5
export const HERO_HOME_HOT_LIMIT = 4

// The photo's rendered width: the slider's flex base on wide screens, the viewport once the slider
// stacks over the tile below 1100px.
export const HERO_HOME_SLIDE_IMAGE_SIZES = '(min-width: 1100px) 766px, 100vw'

// A "hot" card's cover: half of the 610px tile minus its padding and gap on wide screens, half
// of the viewport while the tile spans it, the full width on phones.
export const HERO_HOME_HOT_IMAGE_SIZES = '(min-width: 1100px) 269px, (min-width: 641px) 50vw, 100vw'

// The first row of the "hot" tile shows the author on its cards.
export const HERO_HOME_HOT_AUTHOR_CARDS = 2
