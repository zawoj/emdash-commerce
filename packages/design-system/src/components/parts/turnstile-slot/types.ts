export interface TurnstileSlotProps {
  /** The public site key of the Cloudflare Turnstile widget. */
  siteKey: string
  /** The form this widget protects; Cloudflare binds the token to it and the server checks it (`[a-z0-9_-]{1,32}`). */
  action: string
  /** The widget's language (`pl`, `en`). */
  language: string
  /** Shown under the form while the visitor submits before the token is ready. */
  pendingText: string
  /** Shown when the widget could not load or run; the form can still be sent and the server decides. */
  errorText: string
  /** Gallery only: draw the state statically, without loading Cloudflare. */
  previewState?: 'pending' | 'error'
}
