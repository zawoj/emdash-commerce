import type { PromiseListLayout } from './variants'
import type { IconName } from '../../atoms/icon/names'

export interface PromiseItem {
  readonly icon: IconName
  readonly text: string
  /** A second, quieter line (the delivery window under "Tracked delivery"); shown by the `columns` layout. */
  readonly detail?: string
}

export interface PromiseListProps {
  /** At most `PROMISE_LIST_LIMIT` (3) are shown. */
  items: readonly PromiseItem[]
  layout?: PromiseListLayout
}
