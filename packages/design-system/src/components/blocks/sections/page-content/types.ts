import type { PageContentWidth } from './variants'

/** The `pageContent` block: an optional heading over a plain-text body (line breaks kept). */
export interface PageContentProps {
  readonly title?: string
  readonly body: string
  readonly width?: PageContentWidth
}
