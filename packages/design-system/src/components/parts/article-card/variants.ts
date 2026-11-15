// Figma "card-article" (625:4400) layout axis: `stacked` = photo above the text ("1-2" / "3+"
// grid cards), `feature` = photo beside a 36px title + excerpt ("1 (horizontal)"), `row` = 104×62
// thumbnail beside a 16px title ("XS with Image"), `search` = the row with the content kind above
// the title ("search result"), `text` = title + date without a photo ("XS no image").
export const articleCardVariants = {
  stacked: 'stacked',
  feature: 'feature',
  row: 'row',
  search: 'search',
  text: 'text',
} as const
export type ArticleCardVariant = (typeof articleCardVariants)[keyof typeof articleCardVariants]

// Title size of a `stacked` card: `l` = Figma's 20px display-xs (every grid card), `m` = 16px.
export const articleCardSizes = {
  m: 'm',
  l: 'l',
} as const
export type ArticleCardSize = (typeof articleCardSizes)[keyof typeof articleCardSizes]
