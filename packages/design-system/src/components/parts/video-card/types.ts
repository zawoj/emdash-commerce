export interface VideoAuthor {
  readonly name: string
  readonly avatar?: {
    readonly src: string
    /** The avatar photo's rendered box inside the 20px circle (cover of a square photo). */
    readonly x: number
    readonly y: number
    readonly size: number
  }
}

/** A zoomed thumbnail: Figma draws the 16:9 photo at x/y with this width inside the thumbnail box. */
export interface ThumbnailCrop {
  readonly x: number
  readonly y: number
  readonly width: number
}

/** Figma video "Link" card of the tile-youtube modules. */
export interface VideoCardContent {
  readonly title: string
  readonly author: VideoAuthor
  /** Shown under the title when known (a video's upload date is not part of its oEmbed answer). */
  readonly date?: string
  readonly href: string
  readonly thumbnail: string
  readonly crop?: ThumbnailCrop
}
