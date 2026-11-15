export interface SpecRow {
  readonly term: string
  readonly value: string
  /** Makes the value a link (a tracking number that opens the carrier's page). */
  readonly href?: string
  /** Names the row for a script that rewrites its value (`data-spec-key`), e.g. a row that follows the chosen variant. */
  readonly key?: string
  /** The row exists but has no value to show now (it appears when a script gives it one). */
  readonly isHidden?: boolean
}

export interface SpecTableProps {
  rows: readonly SpecRow[]
  /** The table's caption ("Specification"); keeps the table named without a visible heading. */
  caption: string
}
