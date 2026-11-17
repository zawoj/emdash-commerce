// Attributes of one responsive <img>, as the consuming app computes them (in the storefront, the image
// attribute helper of its media module returns exactly this shape). Components spread them onto
// their <img> and only add their own layout; the value vocabularies are the HTML ones.
import type { HTMLAttributes } from 'astro/types'

type ImgAttributes = HTMLAttributes<'img'>

export interface ImageAttrs {
  readonly src: string
  readonly srcset?: string
  /** Chosen by the caller for the place the image renders in — a component cannot know its layout. */
  readonly sizes?: string
  /** Intrinsic size in px; components size the image with CSS, these only reserve its box. */
  readonly width?: number
  readonly height?: number
  /** Empty for a decorative image. */
  readonly alt: string
  readonly loading?: ImgAttributes['loading']
  readonly decoding?: ImgAttributes['decoding']
  readonly fetchpriority?: ImgAttributes['fetchpriority']
}
