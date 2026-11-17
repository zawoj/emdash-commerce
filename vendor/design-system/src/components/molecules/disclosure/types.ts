export interface DisclosureProps {
  summary: string
  isOpen?: boolean
  /** Wraps the summary text in a heading of this level (FAQ, product tabs); none = plain text. */
  headingLevel?: 2 | 3 | 4
  /** Rows sharing a `group` open one at a time (native exclusive accordion). */
  group?: string
}
