import type { IconName } from '../../atoms/icon/names'

export interface AccountLink {
  readonly label: string
  readonly description: string
  readonly href: string
  readonly icon: IconName
}

export interface AccountLinksProps {
  links: readonly AccountLink[]
  /** Accessible name of the list ("Manage your account"). */
  label: string
}
