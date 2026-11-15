export interface AccountNavItem {
  readonly label: string
  readonly href: string
  readonly isCurrent?: boolean
}

export interface AccountNavProps {
  items: readonly AccountNavItem[]
  /** Accessible name of the navigation ("Account"). */
  label: string
}
