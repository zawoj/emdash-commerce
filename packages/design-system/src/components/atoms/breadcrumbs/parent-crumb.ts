// The phone's back link: the nearest ancestor of the current page that can be linked. The trail's
// last item is the current page; the parent is the closest earlier item with an `href` (a crumb
// without one is a label only). No parent = nothing to go back to (a top-level page).
export interface CrumbRef {
  readonly label: string
  readonly href?: string
}

export const parentCrumb = <T extends CrumbRef>(items: readonly T[]): (T & { href: string }) | null => {
  for (let index = items.length - 2; index >= 0; index--) {
    const item = items[index]
    if (item?.href) return item as T & { href: string }
  }
  return null
}
