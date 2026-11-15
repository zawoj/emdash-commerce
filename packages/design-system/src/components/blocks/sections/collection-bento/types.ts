import type { ImageAttrs } from '../../../../types/image'
import type { LinkContent } from '../../../../types/link'
import type { CollectionTileTone } from './variants'

interface CollectionTileBase {
  /** Small expanded-caps label above the name ("Autumn / Winter"). */
  readonly eyebrow?: string
  /** The collection's name, condensed caps. */
  readonly title: string
  /** How much is in it ("48 pieces"). */
  readonly meta?: string
  /** The tile's one link (a pill), stretched over the whole tile. */
  readonly link: LinkContent
}

/** A photo tile: the photo fills it, copy sits on a scrim. */
export interface CollectionPhotoTile extends CollectionTileBase {
  readonly image: ImageAttrs
  readonly tone?: undefined
}

/** A solid volt or black text tile — the bento's rhythm break. */
export interface CollectionTextTile extends CollectionTileBase {
  readonly tone: CollectionTileTone
  readonly image?: undefined
}

export type CollectionTile = CollectionPhotoTile | CollectionTextTile

/**
 * Collections as an asymmetric bento. Tiles fill the slots in order: large (2 × 2), wide (2 × 1) and
 * two small ones; extra tiles are ignored.
 */
export interface CollectionBentoProps {
  readonly heading: string
  readonly headingId?: string
  readonly more?: LinkContent
  readonly tiles: readonly CollectionTile[]
}
