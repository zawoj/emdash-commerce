import type { PopularPostsLook } from './variants'
import type { WidgetHeading } from '../../../../types/heading'
import type { CategoryRef } from '../../../atoms/category-label/types'
import type { PopularItem } from '../../../parts/popular-widget/types'
import type { PartnerCredit } from '../../../parts/powered-by/types'

export interface PopularPostsProps extends WidgetHeading {
  look: PopularPostsLook
  readonly items: readonly PopularItem[]
  /** `recommended`: the category's pill at the right of the title row. */
  readonly label?: CategoryRef
  /** `recommended`: the "powered by" credit of the category's strategic partner. */
  readonly credit?: PartnerCredit
}
