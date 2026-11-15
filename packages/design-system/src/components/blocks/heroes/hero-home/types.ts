import type { DisplayDate } from '../../../../types/date'
import type { WidgetHeading } from '../../../../types/heading'
import type { ImageAttrs } from '../../../../types/image'
import type { CategoryRef } from '../../../atoms/category-label/types'
import type { ArticleCardContent } from '../../../parts/article-card/types'

/** One slide of the lead slider: a featured article over its photo. */
export interface HeroHomeSlide {
  readonly href: string
  readonly title: string
  readonly date: DisplayDate
  readonly image: ImageAttrs
  readonly category?: CategoryRef
  readonly excerpt?: string
  readonly author?: string
  /** Names the slide and its progress bar for assistive technology ("Wpis 2 z 5"). */
  readonly label: string
}

/** The "hot" tile: its heading and the articles in two rows of two. */
export interface HeroHomeHot extends WidgetHeading {
  readonly articles: readonly ArticleCardContent[]
}

export interface HeroHomeProps {
  /** The page's H1, visually hidden: the slides' titles are H2s. */
  readonly title?: string
  /** Names the slider for assistive technology. */
  readonly sliderLabel?: string
  readonly slides: readonly HeroHomeSlide[]
  readonly hot?: HeroHomeHot
  /** Position of the block on the page; only the first block may load its photo eagerly. */
  readonly index?: number
}
