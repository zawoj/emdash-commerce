export interface ReviewFormValues {
  readonly rating?: string
  readonly title?: string
  readonly body?: string
}

export interface ReviewFormErrors {
  readonly rating?: string
  readonly title?: string
  readonly body?: string
  /** A problem with the form as a whole (the line is not reviewable, too many attempts). */
  readonly form?: string
}

export interface ReviewFormProps {
  /** Prefix of the field ids; unique on the page. */
  id: string
  /** Where the form posts. */
  action: string
  /** Fixed fields the endpoint needs (order number, line, locale). */
  hidden: readonly { readonly name: string; readonly value: string }[]
  /** The form's heading ("Review Trail Runner shoes"). */
  heading: string
  /** One option per star, 1–5, each named ("4 stars"). */
  ratingOptions: readonly { readonly value: string; readonly label: string }[]
  ratingLegend: string
  titleLabel: string
  titleMax: number
  bodyLabel: string
  bodyHint: string
  bodyMin: number
  bodyMax: number
  /** The live counter; `{count}` and `{max}` are filled in ("{count} / {max}"). */
  counterTemplate: string
  submitLabel: string
  /** Spoken before an error ("Error"). */
  errorLabel: string
  /** Marks a field the shopper may skip ("optional"). */
  optionalLabel: string
  values?: ReviewFormValues
  errors?: ReviewFormErrors
  /** Replaces the form once the review is sent. */
  success?: { readonly title: string; readonly text: string }
  /** Spoken before a success message ("Success"). */
  successLabel?: string
}
