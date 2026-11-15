export interface CheckoutRecapSection {
  /** The section's label ("Contact", "Delivery"). */
  readonly title: string
  /** The main line: an e-mail, a name, a payment method. */
  readonly name: string
  /** The remaining lines in reading order (street, postcode and city, phone). */
  readonly lines?: readonly string[]
  /** "Change" — the step that edits this section. */
  readonly change: { readonly href: string; readonly label: string; readonly ariaLabel?: string }
}

export interface CheckoutRecapProps {
  sections: readonly CheckoutRecapSection[]
  /** Accessible name of the list ("Your order details"). */
  label?: string
}
