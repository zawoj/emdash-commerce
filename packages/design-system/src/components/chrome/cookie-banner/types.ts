/** One choice of the cookie banner's panel. */
export interface CookieBannerCategory {
  /** The category the consent script reads (`data-cookie-toggle`) and the field's name. */
  readonly key: string
  /** Unique id of the checkbox on the page. */
  readonly id: string
  readonly label: string
  readonly description: string
  /** On and unchangeable (the necessary cookies). */
  readonly isLocked?: boolean
}
