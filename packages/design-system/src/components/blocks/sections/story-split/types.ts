import type { ImageAttrs } from '../../../../types/image'
import type { LinkContent } from '../../../../types/link'
import type { StorySplitSide } from './variants'

export interface StoryChapter {
  /** The chapter's index label ("01"). */
  readonly eyebrow?: string
  readonly title: string
  readonly text: string
  readonly link?: LinkContent
}

/** An editorial story: a photo that stays in view on one side while the chapters scroll on the other. */
export interface StorySplitProps {
  readonly heading: string
  /** Labels the section; unique per page. */
  readonly headingId?: string
  readonly image: ImageAttrs
  /** Which side the photo takes. */
  readonly side?: StorySplitSide
  readonly chapters: readonly StoryChapter[]
}
