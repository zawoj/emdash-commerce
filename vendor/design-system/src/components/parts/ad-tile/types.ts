import type { ImageAsset } from '../../../types/asset'

/** An art-directed creative: shown instead of the default one while `media` matches. */
export interface AdNarrowCreative {
  readonly creative: ImageAsset
  /** Media query of the viewports that get this creative, e.g. `(max-width: 1439px)`. */
  readonly media: string
}

/** An ad creative; a CMS image brings its own sizes (`srcset` + `sizes`). */
export interface AdCreative extends ImageAsset {
  readonly srcset?: string
  readonly sizes?: string
}

/** Where a creative leads: a sponsored link. */
export interface AdLink {
  readonly href: string
  readonly isNewTab?: boolean
}

/** What a measuring script reads from a tile: written as `data-ad-*` attributes on it. */
export interface AdMeasure {
  readonly campaign: string
  /** The place the tile sits in. */
  readonly slot: string
  readonly pageType?: string
}

/** Figma "tile-ad": the creative (one exported image) + the "ad-info" disclaimer. */
export interface AdContent {
  readonly creative: AdCreative
  readonly disclaimer: string
  /** Names the slot for assistive technology. */
  readonly label: string
  /** The creative is a link when this is given. */
  readonly link?: AdLink
  /** A differently composed creative for a narrower slot (article 1200's 778px band). */
  readonly narrow?: AdNarrowCreative
  /** Identifies the tile to a measuring script. */
  readonly measure?: AdMeasure
}
