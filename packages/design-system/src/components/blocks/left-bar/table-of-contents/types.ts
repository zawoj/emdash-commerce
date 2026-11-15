export interface TableOfContentsEntry {
  /** The anchor the entry links to (without the `#`). */
  readonly id: string
  readonly label: string
  /** Entries nested one level under this one. */
  readonly children?: readonly TableOfContentsEntry[]
}

export interface TableOfContentsProps {
  heading: string
  /** Labels the nav landmark; unique per page. */
  headingId: string
  entries: readonly TableOfContentsEntry[]
  /** The entry shown as the current section (medium weight, underlined). */
  currentId?: string
  /** Pins the tile while the article scrolls (the article page). */
  isSticky?: boolean
  /** The tile's own id, the target of a narrow layout's contents toggle. */
  id?: string
}
