import type { YoutubeVideosLook } from './variants'
import type { WidgetHeading } from '../../../../types/heading'
import type { VideoCardContent } from '../../../parts/video-card/types'

export interface YoutubeVideosProps extends WidgetHeading {
  look: YoutubeVideosLook
  readonly videos: readonly VideoCardContent[]
  /** `grid`: carousel page dots under the row (decorative, as Figma draws them). */
  readonly pageCount?: number
}
