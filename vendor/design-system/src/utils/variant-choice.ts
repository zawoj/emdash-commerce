// The DOM half of a variant choice: reads the chips of a picker (`VariantPicker`), judges every chip against the
// current choice (struck through and disabled when sold out for it, or when no variant has the combination) and
// names the variant a complete choice leads to. Shared by the product page's buy box and the "shop the look" dialog.
import { setSoldOutNote } from './sold-out-note'
import { isPickable, resolveChoice, settleChoice, valueAvailability, VALUE_AVAILABILITY, type AvailabilityVariant, type ResolvedChoice, type VariantChoiceState } from './variant-availability'

/** The radio group of an axis is named `option:<axis code>` (the web's `OPTION_FIELD_PREFIX`). */
export const OPTION_PREFIX = 'option:'

/** The value each axis has checked. */
export const readSelection = (root: ParentNode, axes: readonly string[]): Record<string, string> => {
  const chosen: Record<string, string> = {}
  for (const axis of axes) {
    const input = root.querySelector<HTMLInputElement>(`input[type="radio"][name="${CSS.escape(OPTION_PREFIX + axis)}"]:checked`)
    if (input) chosen[axis] = input.value
  }
  return chosen
}

export interface ChipSync<TVariant extends AvailabilityVariant & { readonly id: number }> extends ResolvedChoice<TVariant> {
  readonly chosen: Readonly<Record<string, string>>
}

/**
 * Re-judges every chip of `root` against the current choice and unchecks a chosen value that just became unpickable.
 * `isInitial` keeps what the server preselected, even a sold-out variant.
 */
export const syncVariantChips = <TVariant extends AvailabilityVariant & { readonly id: number }>(root: ParentNode, state: VariantChoiceState<TVariant>, isInitial = false): ChipSync<TVariant> => {
  const settled = settleChoice(state as VariantChoiceState, readSelection(root, state.axes), isInitial)
  for (const input of root.querySelectorAll<HTMLInputElement>('input[type="radio"]')) {
    const axis = input.name.slice(OPTION_PREFIX.length)
    if (input.checked && settled[axis] !== input.value) {
      input.checked = false
      const slot = input.closest<HTMLElement>('[data-variant-axis]')?.querySelector<HTMLElement>('[data-variant-value]')
      if (slot) slot.textContent = ''
    }
    const availability = valueAvailability(state.variants, axis, input.value, settled)
    input.disabled = !(input.checked && isInitial) && !isPickable(availability)
    const label = input.closest<HTMLElement>('label.option-chip')
    label?.classList.toggle('option-chip--sold-out', availability === VALUE_AVAILABILITY.soldOut)
    if (label) setSoldOutNote(label, availability === VALUE_AVAILABILITY.soldOut)
  }
  return { chosen: settled, ...resolveChoice(state, settled) }
}
