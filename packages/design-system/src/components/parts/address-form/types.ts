import type { AddressFieldKey } from './variants'
import type { FieldSelectOption } from '../../atoms/field-select/index.astro'

export interface AddressFieldContent {
  /** The field's name ("Postcode"). A placeholder shows the format, never the same word. */
  readonly label: string
  readonly placeholder?: string
  readonly value?: string
  /** Inline validation message under the field. */
  readonly error?: string
  /** Overrides the `autocomplete` token the form picks for the key. */
  readonly autocomplete?: string
  readonly isRequired?: boolean
  readonly description?: string
}

export interface AddressFormProps {
  /** Prefix of the control ids; unique per address form on a page. */
  id: string
  /** Prepended to every control name (`shippingAddress.`), so two forms can share a page. */
  namePrefix?: string
  /** The group's name for screen readers ("Delivery address"). */
  legend: string
  /** Content per key; a key without content is not rendered. */
  fields: Partial<Record<AddressFieldKey, AddressFieldContent>>
  /** The options of the country select; needed when `fields.country` is set. */
  countryOptions?: readonly FieldSelectOption[]
  /** Spoken before an inline error ("Error"). */
  errorLabel?: string
}
