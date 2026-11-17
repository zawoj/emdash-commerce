// Placement axis of the events table: `flush` = edge to edge inside its tile, first column inset
// 24px (home 931:28686); `boxed` = inside a 1px bordered radius-md frame within a padded tile,
// first column inset 12px (kalendarz 1023:60270).
export const eventTableVariants = {
  flush: 'flush',
  boxed: 'boxed',
} as const
export type EventTableVariant = (typeof eventTableVariants)[keyof typeof eventTableVariants]
