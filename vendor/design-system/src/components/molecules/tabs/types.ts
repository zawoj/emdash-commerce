export interface TabItem {
  /** Stable id: names the panel's slot (`tab-<id>`), the `#hash` that opens the tab and its DOM ids. */
  readonly id: string
  readonly label: string
}

/** Tabs over named slots: the panel of a tab with id `x` is the slot `tab-x`. */
export interface TabsProps {
  /** Prefix of the generated DOM ids; unique on the page. */
  readonly id: string
  /** Only the tabs that have content; with a single one there is no bar, just its content. */
  readonly tabs: readonly TabItem[]
  /** Id of the heading that names the tab bar. */
  readonly labelledby?: string
  /** Names the tab bar when there is no heading to point at. */
  readonly label?: string
}
