import type { WidgetHeading } from '../../../types/heading'
import type { VideoCardContent } from '../video-card/types'

/** Figma sidebar "tile-youtube" (widget-R, "polecany film"): one wide video card. */
export interface VideoWidgetContent extends WidgetHeading {
  readonly video: VideoCardContent
}
