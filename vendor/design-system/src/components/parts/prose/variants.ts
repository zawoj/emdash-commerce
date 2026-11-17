// How wide a `ProseFigure` sets its photo: `natural` keeps the photo's own size (capped by the
// column), `sm` and `md` are fixed widths, `full` fills the column.
export const proseFigureSizes = {
  natural: 'natural',
  sm: 'sm',
  md: 'md',
  full: 'full',
} as const
export type ProseFigureSize = (typeof proseFigureSizes)[keyof typeof proseFigureSizes]
