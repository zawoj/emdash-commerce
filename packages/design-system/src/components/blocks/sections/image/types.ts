import type { ImageBlockSize } from './variants'
import type { ImageAttrs } from '../../../../types/image'

/** The standalone `image` block: one photo with an optional caption, centred in the column. */
export interface ImageBlockProps {
  readonly image: ImageAttrs
  readonly caption?: string
  readonly size?: ImageBlockSize
}
