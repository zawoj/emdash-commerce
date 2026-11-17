import type { DisplayDate } from '../../../types/date'
import type { ImageAttrs } from '../../../types/image'
import type { CategoryRef } from '../../atoms/category-label/types'

/** Figma "card-article". Every field but title/href is optional — Figma omits them per card. */
export interface ArticleCardContent {
  readonly title: string
  readonly href: string
  /** Without one (an undated page in search results) the card shows no date. */
  readonly date?: DisplayDate
  /** Cover photo; a photo variant without one keeps its empty frame so grid rows stay aligned. */
  readonly image?: ImageAttrs
  readonly author?: string
  /** Rendered with `white-space: pre-line`: `\n` breaks lines as Figma's text node does. */
  readonly excerpt?: string
  /** Category Label drawn over the photo's bottom-left corner. */
  readonly category?: CategoryRef
  /** `search` variant: the content kind shown above the title (e.g. "Article"). */
  readonly kind?: string
}
