/** One language the current page exists in. */
export interface LocaleOption {
  /** Language code ("en"); the link's `hreflang` and `lang`. */
  readonly code: string
  /** The same page in this language. */
  readonly href: string
  /** The visible short form ("EN"). */
  readonly label: string
  /** The language's own name ("English"), spoken and shown as the link's tooltip. */
  readonly name: string
}

export interface LocaleSwitcherProps {
  /** The language of the page being shown. */
  current: string
  /** One entry per language the page exists in, the current one included. */
  options: readonly LocaleOption[]
  /** Accessible name of the navigation ("Language"). */
  label: string
}
