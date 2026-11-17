export const orderConfirmationTones = {
  success: 'success',
  pending: 'pending',
  failed: 'failed',
} as const
export type OrderConfirmationTone = (typeof orderConfirmationTones)[keyof typeof orderConfirmationTones]

export interface OrderConfirmationFact {
  /** "Delivery", "Payment". */
  readonly label: string
  readonly value: string
}

export interface OrderConfirmationStep {
  readonly title: string
  readonly text: string
}

export interface OrderConfirmationProps {
  /** Which result the page announces; it picks the marker and the accent. */
  tone?: OrderConfirmationTone
  /** The page's H1 ("Thanks, Anna — you're in."). */
  heading: string
  /** One sentence under it ("We sent the confirmation to anna@example.com."). */
  text?: string
  /** `data-testid` on the status line (`checkout-status`). */
  textTestId?: string
  /** "Order number". */
  numberLabel: string
  /** The number itself, set large. */
  number: string
  /** `data-testid` on the order number (`checkout-order-number`). */
  numberTestId?: string
  /** A few facts beside the number (expected delivery, how it is paid). */
  facts?: readonly OrderConfirmationFact[]
  /** What happens next, numbered. */
  nextHeading?: string
  nextSteps?: readonly OrderConfirmationStep[]
}
