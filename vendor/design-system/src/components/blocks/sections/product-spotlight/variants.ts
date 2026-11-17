// Where a callout's label sits relative to its marker: `end` / `start` hang sideways on a horizontal
// hairline; `up` / `down` run a vertical hairline to the photo's free top or bottom edge band.
export const calloutSides = {
  end: 'end',
  start: 'start',
  up: 'up',
  down: 'down',
} as const
export type CalloutSide = (typeof calloutSides)[keyof typeof calloutSides]
