import type { HTMLAttributes } from 'astro/types'

/** One value of a variant axis (a size, a colour) as a chip. */
export interface OptionChipContent {
  readonly value: string
  readonly label: string
  readonly isChecked?: boolean
  /** The combination cannot be chosen at all; the control is disabled. */
  readonly isDisabled?: boolean
  /** The value exists but is sold out: it is struck through and carries `soldOutLabel` as text (the app also sets `isDisabled` when it must not be chosen). */
  readonly isSoldOut?: boolean
}

export interface OptionChipProps
  extends Omit<HTMLAttributes<'input'>, 'id' | 'name' | 'type' | 'value' | 'checked' | 'disabled' | 'class'> {
  id: string
  /** The radio group's (or the checkbox's) name. */
  name: string
  option: OptionChipContent
  /** The visible words of a sold-out value ("Sold out"); required for a chip with `isSoldOut`. */
  soldOutLabel?: string
  /** `radio` for one value per axis, `checkbox` for a facet that takes several. */
  kind?: 'radio' | 'checkbox'
}
