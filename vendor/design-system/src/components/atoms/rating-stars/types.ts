import type { RatingStarsSize } from './variants'

export interface RatingStarsProps {
  /** The rating drawn, 0–5; a fraction fills that part of the star ("4.5"). */
  value: number
  /** The accessible text of the whole rating ("4.5 out of 5"); the stars themselves are hidden from screen readers. */
  label: string
  size?: RatingStarsSize
}
