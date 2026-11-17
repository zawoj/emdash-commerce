import type { PageHeroAlignment, PageHeroTone } from './variants'
import type { ImageAttrs } from '../../../../types/image'
import type { LinkContent } from '../../../../types/link'

/** The opening of a plain CMS page: an optional eyebrow, the H1, a lead and one call to action. */
export interface PageHeroProps {
  /** The page's H1. */
  readonly title: string
  readonly lead?: string
  /** The short line above the title. */
  readonly eyebrow?: string
  readonly action?: LinkContent
  /** A second, quieter button next to the action (a photo hero only). */
  readonly secondaryAction?: LinkContent
  /** The campaign photo: the hero becomes a full-bleed photo with the copy bottom-left on a scrim. It is the page's LCP, so it loads eagerly with high priority. */
  readonly image?: ImageAttrs
  readonly alignment?: PageHeroAlignment
  readonly tone?: PageHeroTone
}
