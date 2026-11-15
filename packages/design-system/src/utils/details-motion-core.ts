// Pure helpers behind `details-motion.ts`: durations, keyframes and the open/close decision. No DOM
// access, so they run (and are tested) anywhere.

export const fallbackDurationMs = 280
export const contentOffsetPx = 8

/** Parses a CSS time token ("280ms", "0.28s") to milliseconds; anything else falls back. */
export const parseDurationMs = (value: string, fallback = fallbackDurationMs): number => {
  const match = /^\s*(-?\d*\.?\d+)\s*(ms|s)\s*$/.exec(value)
  if (!match) return fallback
  const amount = Number(match[1])
  if (!Number.isFinite(amount) || amount < 0) return fallback
  return match[2] === 's' ? amount * 1000 : amount
}

/** The height of a collapsed `<details>`: its summary plus its own vertical padding and border. */
export const closedHeight = (summaryHeight: number, chrome: number): number => summaryHeight + chrome

export const heightKeyframes = (from: number, to: number): Keyframe[] => [{ height: `${from}px` }, { height: `${to}px` }]

export const contentKeyframes = (isOpening: boolean): Keyframe[] => {
  const hidden = { opacity: 0, transform: `translateY(${contentOffsetPx}px)` }
  const shown = { opacity: 1, transform: 'translateY(0)' }
  return isOpening ? [hidden, shown] : [shown, hidden]
}

export const motionActions = { open: 'open', close: 'close' } as const
export type MotionAction = (typeof motionActions)[keyof typeof motionActions]

/** A click toggles what the user SEES: a details that is mid-close counts as closed. */
export const nextAction = (isOpen: boolean, isClosing: boolean): MotionAction =>
  isOpen && !isClosing ? motionActions.close : motionActions.open

/**
 * Scales the remaining duration of an interrupted animation so a short distance does not take as
 * long as the full one (never below a quarter of the base).
 */
export const scaledDuration = (base: number, from: number, to: number, full: number): number => {
  if (full <= 0) return base
  const ratio = Math.min(1, Math.abs(to - from) / full)
  return Math.max(base * 0.25, base * ratio)
}
