export interface CheckoutSummaryToggle {
  /** The closed phone bar ("Show order summary"). */
  readonly label: string
  /** The open phone bar ("Hide order summary"). */
  readonly openLabel: string
  /** The order total, formatted, kept in sight while the summary is folded. */
  readonly total: string
}

export interface CheckoutLayoutProps {
  /** The page's H1, spoken once. */
  heading: string
  /** Where the step's form posts. */
  action?: string
  method?: 'post' | 'get'
  /** The form's id, so a control outside it (the summary's button) can submit it with `form=`. */
  id?: string
  /** Phone: where the app-style back bar under the header leads (the previous step or the cart); wider screens keep the step's own back link in the button row. */
  back?: { href: string; label: string }
  /** On a phone the summary folds behind a bar with the total; none = it always shows under the step. */
  summaryToggle?: CheckoutSummaryToggle
}
