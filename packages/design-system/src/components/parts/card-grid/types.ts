/** The tile of a card grid: the cards are its slot; without any it shows `emptyLabel`. */
export interface CardGridProps {
  readonly isEmpty?: boolean
  readonly emptyLabel?: string
}
