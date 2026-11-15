import type { ImageAttrs } from '../../../../types/image'
import type { CategoryKey } from '../../../atoms/category-label/variants'

export interface CategoryPartnerProps {
  /** The caption bar's text; also names the tile for assistive technology. */
  caption: string
  /** Labels the tile's section; unique per page. */
  captionId: string
  /** The category's colour: any CSS colour (a CMS category's hex) or a palette key. */
  color?: string
  category?: CategoryKey
  partner: {
    readonly name: string
    /** The partner's own website, linked as a sponsored link. */
    readonly href?: string
    readonly logo?: ImageAttrs
  }
}
