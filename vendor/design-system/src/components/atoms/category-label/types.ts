import type { CategoryKey } from './variants'

/**
 * A category pill's content: the visible text (rendered uppercase) and its colour — either any CSS
 * colour (`color`, e.g. a CMS category's hex) or a design palette key (`key`, the
 * `--category-<key>` token). `color` wins when both are set.
 */
export interface CategoryRef {
  readonly label: string
  readonly color?: string
  readonly key?: CategoryKey
}
