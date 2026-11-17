export interface FreeShippingProgressProps {
  /** Prefix of the message's id (the bar is labelled by it); unique per bar on a page. */
  id?: string
  /** The sentence ("Add 70,00 zł more for free delivery" / "Delivery is free"). */
  message: string
  /** The basket value so far, in the same unit as `target`. */
  value: number
  /** The threshold for free delivery. */
  target: number
  /** True once `value >= target`: the bar is full and the message carries a check. */
  isReached?: boolean
}
