import type { ImageAttrs } from '../../../types/image'

export interface GalleryImage {
  /** The full-size photo of the slide. */
  readonly image: ImageAttrs
  /** A small photo for the thumbnail; defaults to `image`. */
  readonly thumbnail?: ImageAttrs
  /** The variant this photo belongs to (a colour key); lets `product-gallery:filter` show one colour's set. */
  readonly group?: string
}

export interface ProductGalleryProps {
  /** Prefix of the slide ids; unique per gallery on a page. */
  id: string
  images: readonly GalleryImage[]
  /** Accessible name of the photo track ("Product photos"); the track is a keyboard-scrollable region. */
  label: string
  /** Accessible name of the thumbnail list ("Choose a photo"). */
  thumbnailsLabel: string
  /** Spoken name of one thumbnail with `{index}` and `{total}` ("Photo {index} of {total}"). */
  thumbnailLabelTemplate: string
  /** The first photo is the page's LCP image: eager with high priority (default). Off for a gallery below the fold. */
  isEager?: boolean
}
