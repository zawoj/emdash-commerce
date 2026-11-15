export const timelineStates = {
  done: 'done',
  current: 'current',
  upcoming: 'upcoming',
} as const
export type TimelineState = (typeof timelineStates)[keyof typeof timelineStates]
