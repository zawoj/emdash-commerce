export interface QuantityStepperProps {
  id: string
  /** The number input's name. */
  name: string
  value: number
  min?: number
  max?: number
  step?: number
  /** The input's accessible name ("Quantity of Trail Runner shoes"). */
  label: string
  decreaseLabel: string
  increaseLabel: string
  isDisabled?: boolean
}
