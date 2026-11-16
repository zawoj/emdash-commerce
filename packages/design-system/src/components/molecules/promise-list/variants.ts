export const promiseListLayouts = {
  /** One line of promises (under the add-to-cart button). */
  row: 'row',
  /** Stacked (cart and checkout sidebars). */
  stack: 'stack',
  /** A quiet strip under a hero: the promises side by side (stacked rows on a phone). */
  strip: 'strip',
  /** Next to the buy button: up to three icon + two-line columns on one row, stacked rows on a phone. */
  columns: 'columns',
} as const
export type PromiseListLayout = (typeof promiseListLayouts)[keyof typeof promiseListLayouts]

/** More than three promises weaken each other, so the list never renders more. */
export const PROMISE_LIST_LIMIT = 3
