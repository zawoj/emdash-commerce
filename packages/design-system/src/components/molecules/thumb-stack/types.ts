import type { ImageAttrs } from '../../../types/image'

export interface ThumbStackProps {
  /** Product photos, first on top; a line without a photo is simply left out. */
  images: readonly ImageAttrs[]
  /** Items beyond the shown photos ("+2"); empty when there are none. */
  moreLabel?: string
  /** Thumbnail edge: `md` (56px) for rows, `lg` (72px) for the hero card. */
  size?: 'md' | 'lg'
}
