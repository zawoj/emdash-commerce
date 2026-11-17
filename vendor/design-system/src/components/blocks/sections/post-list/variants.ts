// Posts per page of the archive grid: four rows of three cards. The data layer reads it to size
// its query; the grid lays out whatever it is given.
export const POST_LIST_PAGE_SIZE = 12

// Vertical rhythm of the listing column: `tight` = 8px between the tiles (944:39897 /
// 944:41088), `regular` = 24px (1023:67111 / 1023:67157, wyszukiwanie 1022:54511).
export const postListRhythms = {
  tight: 'tight',
  regular: 'regular',
} as const
export type PostListRhythm = (typeof postListRhythms)[keyof typeof postListRhythms]

// Type of the search query: `sm` = text-medium-sm (944:39899 overrides the component's style),
// `md` = the component's text-regular-md (1023:67113, 1023:67229, 1022:54512).
export const postListSearchSizes = {
  sm: 'sm',
  md: 'md',
} as const
export type PostListSearchSize = (typeof postListSearchSizes)[keyof typeof postListSearchSizes]

// Color of the inactive page numbers, arrows and ellipsis: `subtle` = the atoms' neutral-400
// (1023:67132, 1022:54531), `secondary` = neutral-600 (944:39918).
export const postListPaginationTones = {
  subtle: 'subtle',
  secondary: 'secondary',
} as const
export type PostListPaginationTone = (typeof postListPaginationTones)[keyof typeof postListPaginationTones]

// The cards' rendered width: three columns in the grid tile (20px padding and gutters) next to the
// 360px sidebar, two below 700px of tile, one below 420px; the sidebar drops under the column below
// 900px.
export const POST_LIST_IMAGE_SIZES = [
  '(min-width: 1440px) 306px',
  '(min-width: 1192px) calc((100vw - 536px) / 3)',
  '(min-width: 900px) calc((100vw - 512px) / 2)',
  '(min-width: 808px) calc((100vw - 152px) / 3)',
  '(min-width: 641px) calc((100vw - 128px) / 2)',
  '(min-width: 452px) calc((100vw - 104px) / 2)',
  '120px',
].join(', ')

// The names of the search form's fields — the query-string parameters the archive reads.
export const POST_LIST_FIELDS = {
  query: 'q',
  sort: 'sort',
} as const
