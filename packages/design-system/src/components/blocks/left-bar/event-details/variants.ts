// Look of the block by place: `card` = the accent card of the left bar (Figma "card-zawody-onPage",
// with the sign-up button); `inline` = the same facts as a plain panel with a visible heading, for
// the content column.
export const eventDetailsVariants = {
  card: 'card',
  inline: 'inline',
} as const
export type EventDetailsVariant = (typeof eventDetailsVariants)[keyof typeof eventDetailsVariants]
