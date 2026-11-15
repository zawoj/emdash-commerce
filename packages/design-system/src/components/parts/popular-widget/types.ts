import type { PopularRowSpacing } from './variants'
import type { ImageAsset } from '../../../types/asset'
import type { WidgetHeading } from '../../../types/heading'
import type { CategoryRef } from '../../atoms/category-label/types'
import type { PartnerCredit } from '../powered-by/types'

/** One row of "tile-popularne-widget-R": a text-only card-article. */
export interface PopularItem {
  readonly title: string
  readonly href: string
  readonly date?: string
  readonly author?: string
  /** Category Label pinned to the row's right edge (home / partner / zawody rows have one). */
  readonly category?: CategoryRef
  readonly spacing?: PopularRowSpacing
}

/** Figma "tile-popularne-widget-R" (931:29570: "popularne" / "polecane"). */
export interface PopularWidgetContent extends WidgetHeading {
  /** Logo at the right of the title row (Figma `default`: the brand mark on "popularne"). */
  readonly logo?: ImageAsset
  /** Category Label at the right of the title row (Figma `kategoria`: "polecane" on wpisy-z-kategorii / artykul). */
  readonly label?: CategoryRef
  /** "powered by" credit under the title row (Figma `kategoria-partner`: the article's "polecane"). */
  readonly credit?: PartnerCredit
  readonly items: readonly PopularItem[]
}
