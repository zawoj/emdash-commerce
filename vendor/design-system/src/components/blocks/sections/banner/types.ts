import type { ImageAttrs } from '../../../../types/image'
import type { LinkContent } from '../../../../types/link'

/** The `banner` block: a promotion strip with a heading, a short text, a photo and one button. */
export interface BannerProps {
  readonly heading: string
  /** Labels the section; unique per page. */
  readonly headingId?: string
  readonly text?: string
  /** The photo beside the text; without one the text takes the whole strip. */
  readonly image?: ImageAttrs
  readonly action?: LinkContent
  /** A short label above the heading. */
  readonly eyebrow?: string
  /** Extra attributes per slot (e.g. a CMS's inline-edit annotations); the block adds no meaning to them. */
  readonly attrs?: BannerSlotAttrs
}

export type SlotAttributes = Readonly<Record<string, string | undefined>>

export interface BannerSlotAttrs {
  /** The whole band — where the photo's annotation goes. */
  readonly root?: SlotAttributes
  readonly eyebrow?: SlotAttributes
  readonly heading?: SlotAttributes
  readonly text?: SlotAttributes
  readonly action?: SlotAttributes
}
