import type { PromiseListLayout } from './variants'
import type { IconName } from '../../atoms/icon/names'

export interface PromiseItem {
  readonly icon: IconName
  readonly text: string
}

export interface PromiseListProps {
  /** At most `PROMISE_LIST_LIMIT` (3) are shown. */
  items: readonly PromiseItem[]
  layout?: PromiseListLayout
}
