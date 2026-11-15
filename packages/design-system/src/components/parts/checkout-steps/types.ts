import type { CheckoutStepState } from './variants'

export interface CheckoutStep {
  readonly label: string
  readonly state: CheckoutStepState
  /** A finished step links back to itself so the shopper can edit it. */
  readonly href?: string
}

export interface CheckoutStepsProps {
  steps: readonly CheckoutStep[]
  /** Accessible name of the progress ("Checkout progress"). */
  label: string
  /** Spoken state words, per state ("Completed", "Current step", "Upcoming"). */
  stateLabels: Readonly<Record<CheckoutStepState, string>>
  /** The phone summary with `{current}`, `{total}` and `{label}` ("Step {current} of {total}: {label}"). */
  summaryTemplate: string
}
