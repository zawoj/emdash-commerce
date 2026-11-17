// Which values of a variant axis can be bought given what the shopper has already chosen on the other
// axes, and which variant a complete choice names. Pure: the product page's buy box, the "shop the look"
// dialog and the server render all share these functions.

export const VALUE_AVAILABILITY = { open: 'open', soldOut: 'soldOut', unavailable: 'unavailable' } as const
export type ValueAvailability = (typeof VALUE_AVAILABILITY)[keyof typeof VALUE_AVAILABILITY]

export interface AvailabilityVariant {
  readonly options: Readonly<Record<string, string>>
  readonly isPurchasable: boolean
}

/** What a picker needs of a product's variants: the axes in order and one entry per variant. */
export interface VariantChoiceState<TVariant extends AvailabilityVariant & { readonly id: number } = AvailabilityVariant & { readonly id: number }> {
  readonly axes: readonly string[]
  /** The axis that decides the photos (a colour); null when none does. */
  readonly imageAxis: string | null
  readonly variants: readonly TVariant[]
}

/**
 * `open`: a variant with this value and the chosen values of the other axes can be bought; `soldOut`: such variants
 * exist but none can be bought; `unavailable`: no variant combines this value with the choice.
 */
export const valueAvailability = (variants: readonly AvailabilityVariant[], axis: string, value: string, chosen: Readonly<Record<string, string>>): ValueAvailability => {
  const matching = variants.filter((variant) => variant.options[axis] === value && Object.entries(chosen).every(([other, selected]) => other === axis || variant.options[other] === selected))
  if (matching.length === 0) return VALUE_AVAILABILITY.unavailable
  return matching.some((variant) => variant.isPurchasable) ? VALUE_AVAILABILITY.open : VALUE_AVAILABILITY.soldOut
}

/** A value the shopper cannot pick right now (sold out for the chosen colour, or no such combination). */
export const isPickable = (availability: ValueAvailability): boolean => availability === VALUE_AVAILABILITY.open

export interface ResolvedChoice<TVariant> {
  /** Every axis has a value. */
  readonly isComplete: boolean
  /** The variant the complete choice names; undefined while incomplete (or for a combination that does not exist). */
  readonly variant: TVariant | undefined
  /** The axes still without a value, in axis order. */
  readonly missing: readonly string[]
}

/** The variant a choice names and the axes that are still open. A product without axes has no choice to make. */
export const resolveChoice = <TVariant extends AvailabilityVariant>(
  state: { readonly axes: readonly string[]; readonly variants: readonly TVariant[] },
  chosen: Readonly<Record<string, string>>,
): ResolvedChoice<TVariant> => {
  const missing = state.axes.filter((axis) => chosen[axis] === undefined)
  const isComplete = missing.length === 0
  const variant = isComplete ? state.variants.find((candidate) => state.axes.every((axis) => candidate.options[axis] === chosen[axis])) : undefined
  return { isComplete, variant, missing }
}

/**
 * The choice once values that just became unpickable are dropped: choosing a colour can strike the size picked before it,
 * and that can in turn free or strike another axis, so it repeats until nothing changes. `isInitial` keeps what the
 * server preselected, even a value that is sold out.
 */
export const settleChoice = (state: VariantChoiceState, chosen: Readonly<Record<string, string>>, isInitial = false): Record<string, string> => {
  const settled = { ...chosen }
  if (isInitial) return settled
  for (let pass = 0; pass <= state.axes.length; pass++) {
    const dropped = state.axes.filter((axis) => settled[axis] !== undefined && !isPickable(valueAvailability(state.variants, axis, settled[axis], settled)))
    if (dropped.length === 0) break
    for (const axis of dropped) delete settled[axis]
  }
  return settled
}
