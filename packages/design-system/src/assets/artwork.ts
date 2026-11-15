// Artwork the shared parts draw identically on every page, as opposed to content (photos, copy,
// partner logos) which comes in through props. A project swaps the files here, not the components.
import youtubePlayUrl from './youtube-play.svg?no-inline'
import type { ImageAsset } from '../types/asset'

/** The play glyph on every video thumbnail. */
export const youtubePlayIcon: ImageAsset = {
  src: youtubePlayUrl,
  width: 32,
  height: 32,
  alt: '',
}
