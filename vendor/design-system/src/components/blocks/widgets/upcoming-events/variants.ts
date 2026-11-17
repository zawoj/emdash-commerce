// Look axis of the upcoming events block: `table` = Figma "tile-zawody" table (home 944:29467) in
// the page's zones; `list` = the "tile-zawody" list (widget-R 931:28687) in a bar.
export const upcomingEventsVariants = {
  table: 'table',
  list: 'list',
} as const
export type UpcomingEventsVariant = (typeof upcomingEventsVariants)[keyof typeof upcomingEventsVariants]

// How many events each look shows. The data layer reads it to size its query; the look lays out
// whatever it is given.
export const UPCOMING_EVENTS_LIMITS = {
  [upcomingEventsVariants.table]: 5,
  [upcomingEventsVariants.list]: 3,
} as const satisfies Record<UpcomingEventsVariant, number>
