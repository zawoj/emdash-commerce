// Tone axis — Figma's search bar sets the label in gray/300 (`subtle`: empty states and the zawody
// bar) or gray/400 (`muted`: the filled article bar).
export const filterLabelTones = {
  subtle: 'subtle',
  muted: 'muted',
} as const
export type FilterLabelTone = (typeof filterLabelTones)[keyof typeof filterLabelTones]
