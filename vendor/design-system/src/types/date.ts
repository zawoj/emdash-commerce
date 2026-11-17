// A date as components render it: the caller formats the visible text (locale, style), the
// component puts the machine-readable value into <time datetime>.
export interface DisplayDate {
  /** ISO 8601 date or date-time. */
  readonly iso: string
  /** The formatted text shown to the reader. */
  readonly label: string
}
