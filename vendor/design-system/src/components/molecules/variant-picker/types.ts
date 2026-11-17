import type { LinkContent } from '../../../types/link'
import type { OptionChipContent } from '../../atoms/option-chip/types'

/** One axis of a product's variants (size, colour) with its values. */
export interface VariantAxis {
  /** The radio group's name and the axis' key ("size"). */
  readonly name: string
  /** The axis caption ("Size"). */
  readonly label: string
  readonly options: readonly OptionChipContent[]
  /** The chosen value in words, shown beside the caption ("M"); empty until a value is chosen. */
  readonly selectedLabel?: string
  /** A "size guide" link beside the caption. */
  readonly sizeGuide?: LinkContent
  /** "Choose a size": set by the server (or the app's script) when add-to-cart was pressed without a value. */
  readonly error?: string
}

export interface VariantPickerProps {
  /** Prefix of every id; unique per picker on a page. */
  id: string
  axes: readonly VariantAxis[]
  /** The visible words of a sold-out value ("Sold out"). */
  soldOutLabel: string
  /** Spoken before an axis' error ("Error"). */
  errorLabel?: string
}
