export interface AppliedCoupon {
  readonly code: string
  /** The discount in words ("-10%"), shown beside the code. */
  readonly description?: string
  /** Accessible name of the remove button ("Remove code SUMMER10"). */
  readonly removeLabel: string
}

export interface CouponFormProps {
  id: string
  /** The form's target; applying and removing both post here. */
  action: string
  method?: 'post' | 'get'
  /** The disclosure's text ("Have a code?"). */
  toggleLabel: string
  inputLabel: string
  inputPlaceholder?: string
  submitLabel: string
  /** The input's name. */
  inputName?: string
  /** Name of the remove buttons; their value is the code. */
  removeName?: string
  applied?: readonly AppliedCoupon[]
  /** A rejected code; opens the disclosure and shows an error notice. */
  error?: string
  /** Spoken before the error ("Error"). */
  errorLabel?: string
}
