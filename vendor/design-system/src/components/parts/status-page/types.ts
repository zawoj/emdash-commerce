import type { LinkContent } from '../../../types/link'

export interface StatusPageSearch {
  /** Where the form submits (a GET to the shop's search). */
  action: string
  /** The query's parameter name ("q"). */
  name: string
  label: string
  placeholder?: string
  submitLabel: string
}

export interface StatusPageProps {
  eyebrow: string
  title: string
  description: string
  /** The way back: the volt button. */
  action: LinkContent
  /** A second, quieter way out (the shop, the contact page). */
  secondaryAction?: LinkContent
  /** A search box for a lost visitor (404). */
  search?: StatusPageSearch
  /** Small links under everything else (categories, help). */
  links?: readonly LinkContent[]
  /** The page's <main> unless the layout already renders one. */
  isMain?: boolean
}
