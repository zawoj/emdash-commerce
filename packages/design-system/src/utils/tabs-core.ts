// Pure helpers behind the tabs component (`utils/tabs.ts`): which tabs exist, which one a key press
// or a URL hash selects. No DOM access, so they run (and are tested) anywhere.

export interface TabRef {
  readonly id: string
}

export const tabKeys = {
  next: 'ArrowRight',
  previous: 'ArrowLeft',
  first: 'Home',
  last: 'End',
} as const

/** The tabs whose content exists, in their given order: an empty tab is not rendered. */
export const nonEmptyTabs = <T extends TabRef>(tabs: readonly T[], hasContent: (id: string) => boolean): T[] => tabs.filter((tab) => hasContent(tab.id))

/** A tab bar only makes sense for two tabs or more; a single tab is just its content. */
export const isTabBarShown = (count: number): boolean => count > 1

/** The index a navigation key moves to (arrows wrap around), or `null` for any other key. */
export const nextTabIndex = (key: string, current: number, count: number): number | null => {
  if (count <= 0) return null
  if (key === tabKeys.next) return (current + 1) % count
  if (key === tabKeys.previous) return (current - 1 + count) % count
  if (key === tabKeys.first) return 0
  if (key === tabKeys.last) return count - 1
  return null
}

/** The tab a URL hash ("#specification") names, or `null` when it names none of them. */
export const tabFromHash = (hash: string, ids: readonly string[]): string | null => {
  const id = hash.replace(/^#/, '')
  return ids.includes(id) ? id : null
}
