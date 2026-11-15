export interface CountBadgeProps {
  count: number
  /** Spoken text with a `{count}` placeholder ("{count} items in the cart"). */
  labelTemplate: string
  /** Counts above this show as "<max>+". */
  max?: number
}
