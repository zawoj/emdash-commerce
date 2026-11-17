import type { ImageAttrs } from '../../../types/image'
import type { LinkContent } from '../../../types/link'

/** The introduction of an author at the top of their page: the photo, the role, the bio and the profiles. */
export interface AuthorProfileContent {
  readonly photo?: ImageAttrs
  readonly role?: string
  readonly bio?: string
  /** The author's profiles elsewhere. */
  readonly links: readonly LinkContent[]
}
