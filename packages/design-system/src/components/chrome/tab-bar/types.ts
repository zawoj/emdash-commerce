import type { TabBarAction, TabBarIcon } from './variants'

export interface TabBarItem {
  icon: TabBarIcon
  /** The short visible label ("Start"). */
  label: string
  /** Where a link goes; a button that opens something keeps it as the no-script fallback. */
  href?: string
  action: TabBarAction
  /** The page the shopper is on (a link), or the section they are in (a button that opens a menu). */
  isCurrent?: boolean
  /** The id of the dialog the button opens (the menu drawer, the search overlay) or of the mini-cart. */
  controls?: string
  /** A count bubble on the glyph (the cart). */
  badge?: { count: number; labelTemplate: string }
}

export interface TabBarProps {
  /** Names the <nav>. */
  label: string
  items: readonly TabBarItem[]
}
