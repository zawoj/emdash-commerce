import type { StatusTone } from './variants'

export interface StatusBadgeProps {
  /** The status in words ("Paid", "Shipped"). */
  label: string
  tone?: StatusTone
  /** What the status is about ("Payment"), shown before the label so three badges of an order stay apart. */
  axis?: string
  /** `chip` (default) is the compact label; `line` says the status as a plain sentence, for a row or card headline. */
  variant?: 'chip' | 'line'
}
