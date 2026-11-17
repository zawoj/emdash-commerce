export interface ActionBarMirror {
  /** A stable ancestor to observe (the buy box). */
  root: string
  /** Inside the root: the element whose text is the bar's value (the current price). */
  value?: string
  /** Inside the root: the control whose label and disabled state the bar's button shows. */
  button?: string
}

export interface ActionBarProps {
  /** Names the bar's group. */
  label: string
  /** The small line above the value ("Razem"). */
  caption?: string
  /** The formatted price or total; without it the button spans the bar. */
  value?: string
  /** The primary button: a link with `href`, else a button that is forwarded to `proxy`. */
  action: { label: string; href?: string; isDisabled?: boolean }
  /** Selector of the element whose scrolling out of view brings the bar up; none = always up. */
  watch?: string
  /** Selector of the control a press on the button is forwarded to. */
  proxy?: string
  mirror?: ActionBarMirror
}
