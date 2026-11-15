// Tone of a `StatusBadge`; each tone has its own marker shape so the state reads without colour.
export const statusTones = {
  /** Nothing has happened yet (hollow circle). */
  neutral: 'neutral',
  /** Under way (circle with a dot). */
  progress: 'progress',
  /** Done (filled circle with a check). */
  success: 'success',
  /** Needs attention (triangle). */
  warning: 'warning',
  /** Failed or cancelled (filled diamond). */
  danger: 'danger',
} as const
export type StatusTone = (typeof statusTones)[keyof typeof statusTones]
