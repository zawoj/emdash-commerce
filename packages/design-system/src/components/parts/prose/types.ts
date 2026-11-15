import type { ImageAttrs } from '../../../types/image'

/** One picture of a `ProseGallery`: the stage image and the thumbnail share the same source. */
export interface ProseGalleryImage {
  readonly image: ImageAttrs
  /** Width of the thumbnail's box in px (the photo is contained in it, 56px tall). */
  readonly thumbWidth?: number
}

export interface ProseTableRow {
  readonly cells: readonly string[]
}
