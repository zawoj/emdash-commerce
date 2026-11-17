import type { WidgetHeading } from '../../../types/heading'
import type { LinkContent } from '../../../types/link'

/** Figma "tagi" sidebar tile (915:28447, "Popularne tagi"). */
export interface TagsWidgetContent extends WidgetHeading {
  /** Each tag links to its page. */
  readonly tags: readonly LinkContent[]
}
