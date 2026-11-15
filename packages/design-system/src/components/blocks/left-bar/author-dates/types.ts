import type { DisplayDate } from '../../../../types/date'
import type { ImageAttrs } from '../../../../types/image'

/** An image placed at Figma's own crop box inside the round avatar frame (px, relative to the frame). */
export interface AvatarCrop {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface AuthorAvatar {
  readonly image: ImageAttrs
  /** Without a crop the photo covers the frame. */
  readonly crop?: AvatarCrop
}

export interface AuthorIdentity {
  readonly name: string
  /** The author's page, when the author has one. */
  readonly href?: string
  readonly role?: string
  readonly avatar?: AuthorAvatar
}

export interface AuthorDate {
  readonly label: string
  readonly date: DisplayDate
}

/** The note that the material was made with a brand: the label and the brand it names. */
export interface AuthorCollaboration {
  readonly label: string
  readonly brand: { readonly label: string; readonly href?: string }
}

export interface AuthorDatesProps {
  /** Names the tile for assistive technology; the tile itself shows no heading. */
  heading: string
  /** Labels the tile's section; unique per page. */
  headingId: string
  author?: AuthorIdentity
  dates: readonly AuthorDate[]
  collaboration?: AuthorCollaboration
}
