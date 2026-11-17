import type { LinkContent } from '../../../types/link'

/** Figma 1022:57232 "col-main" (partner strona): the deal's title and text, its tags and the sitemap trail. */
export interface DealInfoProps {
  title?: string
  tagsLabel: string
  sitemapLabel: string
  /** Unique on the page — prefixes the landmark labels. */
  idPrefix: string
  /** Left out of the page when empty. */
  tags: readonly LinkContent[]
  crumbs: readonly LinkContent[]
}
