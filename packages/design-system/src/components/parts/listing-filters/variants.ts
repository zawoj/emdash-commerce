export const filterGroupKinds = {
  /** A list of checkboxes with result counts. */
  checkbox: 'checkbox',
  /** A min / max pair of number inputs. */
  range: 'range',
  /** Option chips (sizes, colours) as checkboxes. */
  chips: 'chips',
} as const
export type FilterGroupKind = (typeof filterGroupKinds)[keyof typeof filterGroupKinds]
