import type { ImageAttrs } from '../../../types/image'

/** The top of a product page: the photos beside the H1, the price and the excerpt. */
export interface ProductDetailProps {
  /** The page's H1. */
  readonly title: string
  /** The product's photos, first one first; the caller marks the first as the LCP image. */
  readonly images: readonly ImageAttrs[]
  readonly price: {
    readonly label: string
    readonly value: number
  }
  readonly excerpt?: string
}
