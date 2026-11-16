export const filterGroupKinds = {
  /** One on/off option shown as a switch ("In stock only"). */
  switch: 'switch',
  /** Option chips as checkboxes: several can be chosen (sizes). */
  chips: 'chips',
  /** A list of checkboxes, each with its result count (brands). */
  checkbox: 'checkbox',
  /** Option chips as radios: exactly one (price presets). */
  segmented: 'segmented',
} as const
export type FilterGroupKind = (typeof filterGroupKinds)[keyof typeof filterGroupKinds]
