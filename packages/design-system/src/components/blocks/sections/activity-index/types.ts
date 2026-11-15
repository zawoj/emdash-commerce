import type { ImageAttrs } from '../../../../types/image'

export interface ActivityIndexItem {
  readonly label: string
  readonly href: string
  /** "24 products": complete text. */
  readonly countLabel: string
  /** Shown beside the list while the row is hovered or focused; a thumbnail on a phone. */
  readonly image: ImageAttrs
}

/** "Shop by activity": a list of huge condensed rows; the hovered row's photo shows in a side slot. */
export interface ActivityIndexProps {
  heading: string
  headingId?: string
  /** One short line under the heading. */
  intro?: string
  items: readonly ActivityIndexItem[]
}
