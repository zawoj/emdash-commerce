import type { LinkContent } from '../../../../types/link'

export interface RelatedRecordsProps {
  heading: string
  /** Labels the tile; unique per page. */
  headingId: string
  links: readonly LinkContent[]
}
