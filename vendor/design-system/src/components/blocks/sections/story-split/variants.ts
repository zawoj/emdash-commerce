// Which side of the story the photo takes (on phones it is always on top).
export const storySplitSides = {
  start: 'start',
  end: 'end',
} as const
export type StorySplitSide = (typeof storySplitSides)[keyof typeof storySplitSides]
