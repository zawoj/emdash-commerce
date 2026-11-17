import type { ImageAttrs } from '../../../types/image'
import type { IconName } from '../../atoms/icon/names'

export interface ChoiceOption {
  readonly value: string
  readonly title: string
  readonly description?: string
  /** The price in words ("12,99 zł", "Free"). */
  readonly price?: string
  /** True when the price is zero: it is set in bold so "free" stands out. */
  readonly isFree?: boolean
  /** The promise or date ("Delivery on Thursday, 12 Nov"). */
  readonly deliveryDate?: string
  /** A courier or payment glyph; a `logo` takes precedence. */
  readonly icon?: IconName
  readonly logo?: ImageAttrs
  readonly isChecked?: boolean
  readonly isDisabled?: boolean
  /** Why a disabled option cannot be chosen ("Not available for orders over 30 kg"). */
  readonly disabledReason?: string
}

export interface ChoiceListProps {
  /** Prefix of the option ids; unique per list on a page. */
  id: string
  /** The radios' name. */
  name: string
  /** The question ("Choose a delivery method"), the group's accessible name. */
  legend: string
  options: readonly ChoiceOption[]
  isRequired?: boolean
  /** Inline error under the list ("Choose a delivery method"). */
  error?: string
  errorLabel?: string
}
