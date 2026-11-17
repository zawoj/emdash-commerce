/** The price a reduced price replaces. */
export interface PriceCompareAt {
  /** The formatted previous price. */
  readonly label: string
  readonly value: number
  /** Spoken before the struck-through price ("Regular price:"), because strikethrough is not read out. */
  readonly prefix?: string
}
