import type { DisplayDate } from '../../../../types/date'
import type { ImageAttrs } from '../../../../types/image'
import type { CategoryRef } from '../../../atoms/category-label/types'
import type { AuthorAvatar } from '../../left-bar/author-dates/types'

export interface HeroContentByline {
  readonly author?: {
    readonly name: string
    /** The author's page, when the author has one. */
    readonly href?: string
    readonly avatar?: AuthorAvatar
  }
  readonly date?: DisplayDate
}

export interface HeroContentFigure {
  readonly image: ImageAttrs
  /** The source line under the photo. */
  readonly caption?: string
}

/** The opening of a post, an event or any other content record: its H1, lead, byline and cover. */
export interface HeroContentProps {
  /** The page's H1. */
  readonly title: string
  readonly lead?: string
  /** The large Category Label above the title. */
  readonly category?: CategoryRef
  readonly byline?: HeroContentByline
  readonly figure?: HeroContentFigure
  /** Position of the block on the page; only the first block may load its photo eagerly. */
  readonly index?: number
}
