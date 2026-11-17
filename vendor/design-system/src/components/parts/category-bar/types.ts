/** One category pill: a plain link; the current one is filled. */
export interface CategoryBarItem {
  readonly label: string
  readonly href: string
  readonly isCurrent?: boolean
  /** How many products it holds, shown small after the label. */
  readonly count?: number
}

export interface CategoryBarProps {
  /** Names the navigation for assistive tech ("Categories"). */
  label: string
  items: readonly CategoryBarItem[]
  /** The element id; a link can point at the bar (`#<id>`). */
  id?: string
}
