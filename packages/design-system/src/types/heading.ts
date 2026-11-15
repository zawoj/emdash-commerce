// Heading shapes shared by the tiles and widgets: the text plus the id that labels the landmark.
import type { LinkContent } from './link'

/** Heading of a tile or widget; `headingId` labels the landmark, so keep it unique per page. */
export interface WidgetHeading {
  readonly heading: string
  readonly headingId: string
}

/** Title row of a content tile: heading + optional "read more" link. */
export interface TileHeading extends WidgetHeading {
  readonly more?: LinkContent
}
