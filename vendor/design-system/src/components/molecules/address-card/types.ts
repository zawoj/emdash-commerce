export interface AddressCardProps {
  /** The recipient's name (first line). */
  name: string
  /** The remaining lines in reading order (company, street, postcode and city, country, phone). */
  lines: readonly string[]
  /** A heading for the card ("Delivery address"); rendered as a <p> label, not a heading. */
  title?: string
  /** A short tag such as "Default". */
  badge?: string
}
