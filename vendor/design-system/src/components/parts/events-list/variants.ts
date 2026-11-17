// Layout axis of the events list tile: `sidebar` = the right-bar widget — badge, then the name and
// location filling the row; `inline` = inside an article body — badge + a 270px name column.
export const eventListVariants = {
  sidebar: 'sidebar',
  inline: 'inline',
} as const
export type EventListVariant = (typeof eventListVariants)[keyof typeof eventListVariants]
