// An image with its intrinsic box, as logos, wordmarks and ad creatives are passed in.

/** An image with its intrinsic box in px (logos, wordmarks, ad creatives). */
export interface ImageAsset {
  readonly src: string
  readonly width: number
  readonly height: number
  readonly alt: string
}
