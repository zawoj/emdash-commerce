// The columns of a menu item, shared by the desktop panel and the phone drawer: the item's `groups`, or
// its flat `children` as one column without a heading.
import type { ChromeLink, ChromeMenuGroup, ChromeMenuItem } from '../types'

/** The most featured tiles a panel shows. */
export const MAX_FEATURED_TILES = 2

export const menuColumns = (item: ChromeMenuItem): readonly ChromeMenuGroup[] => {
  if (item.groups?.length) return item.groups
  return item.children?.length ? [{ label: '', links: item.children }] : []
}

/** The most columns of a panel in one row; more wrap into a second row. */
export const MAX_PANEL_COLUMNS = 6

/** A column with more links than this takes two grid tracks and splits its list in two. */
export const LONG_COLUMN_LINKS = 16

export const isLongColumn = (group: ChromeMenuGroup): boolean => group.links.length > LONG_COLUMN_LINKS

/** The tracks a panel's column grid needs: one per column, a long column counts for two, capped at one row. */
export const panelTrackCount = (columns: readonly ChromeMenuGroup[]): number =>
  Math.min(MAX_PANEL_COLUMNS, Math.max(1, columns.reduce((sum, group) => sum + (isLongColumn(group) ? 2 : 1), 0)))

/** The "All" link that opens a column: the heading's own target under the item's `allLabel`; none without both. */
export const columnAllLink = (item: ChromeMenuItem, group: ChromeMenuGroup): ChromeLink | null => {
  if (!item.allLabel) return null
  const href = group.label ? group.href : item.href
  return href ? { label: item.allLabel, href } : null
}

/** An item opens a panel when it has columns or tiles. */
export const hasMegaPanel = (item: ChromeMenuItem): boolean => menuColumns(item).length > 0 || Boolean(item.featured?.length)

export const featuredTiles = (item: ChromeMenuItem) => (item.featured ?? []).slice(0, MAX_FEATURED_TILES)

export const linkRel = (link: ChromeLink): string | undefined => (link.isNewTab ? 'noopener' : undefined)
export const linkTarget = (link: ChromeLink): string | undefined => (link.isNewTab ? '_blank' : undefined)
