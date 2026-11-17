export const checkoutStepStates = {
  done: 'done',
  current: 'current',
  upcoming: 'upcoming',
} as const
export type CheckoutStepState = (typeof checkoutStepStates)[keyof typeof checkoutStepStates]
