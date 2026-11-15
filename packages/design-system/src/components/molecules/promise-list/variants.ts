export const promiseListLayouts = {
  /** One line of promises (under the add-to-cart button). */
  row: 'row',
  /** Stacked (cart and checkout sidebars). */
  stack: 'stack',
  /** A quiet strip under a hero: the promises side by side between hairlines (a scroll row on a phone). */
  strip: 'strip',
} as const
export type PromiseListLayout = (typeof promiseListLayouts)[keyof typeof promiseListLayouts]

/** More than three promises weaken each other, so the list never renders more. */
export const PROMISE_LIST_LIMIT = 3
