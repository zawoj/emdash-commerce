import type { LinkContent } from '../../../types/link'
import type { IconName } from '../../atoms/icon/names'

export interface EmptyStateProps {
  title: string
  text?: string
  icon?: IconName
  /** The way forward ("Continue shopping"); the primary button. */
  action?: LinkContent
  /** A second, lighter way ("Browse all categories"). */
  secondaryAction?: LinkContent
  headingLevel?: 1 | 2 | 3 | 4
  /** Quick ways back into the catalogue (categories, bestsellers), shown as pills under the buttons. */
  links?: readonly LinkContent[]
  /** The line that introduces `links` ("Or start with"). */
  linksLabel?: string
}
