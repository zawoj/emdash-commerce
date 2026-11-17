// Variant picker: writes the chosen option's text next to the axis label, clears an axis's
// "choose a size" error once a value is picked and reports `variant:change` on the picker root
// (`detail: { name, value }`) so the app can swap price, stock and photos.
export interface VariantChangeDetail {
  readonly name: string
  readonly value: string
}

const mountPicker = (root: HTMLElement) => {
  if (root.dataset.variantMounted) return
  root.dataset.variantMounted = 'true'
  root.addEventListener('change', (event) => {
    const input = event.target as HTMLInputElement
    if (input.type !== 'radio' || !input.checked) return
    const axis = input.closest<HTMLElement>('[data-variant-axis]')
    const valueSlot = axis?.querySelector<HTMLElement>('[data-variant-value]')
    const chipLabel = input.closest('label')?.querySelector('.option-chip__label')
    if (valueSlot && chipLabel) valueSlot.textContent = chipLabel.textContent
    axis?.querySelector<HTMLElement>('[data-variant-error]')?.remove()
    axis?.querySelector('[role="radiogroup"]')?.removeAttribute('aria-invalid')
    root.dispatchEvent(new CustomEvent<VariantChangeDetail>('variant:change', { bubbles: true, detail: { name: input.name, value: input.value } }))
  })
}

/** Scrolls to the first axis without a choice, focuses a chip a shopper can pick (never a sold-out one) and returns the axis. */
export const revealMissingVariant = (root: HTMLElement): HTMLElement | null => {
  const missing = [...root.querySelectorAll<HTMLElement>('[data-variant-axis]')].find((axis) => !axis.querySelector('input:checked'))
  if (!missing) return null
  missing.scrollIntoView({ block: 'center', behavior: 'smooth' })
  const target = missing.querySelector<HTMLElement>('label:not(.option-chip--sold-out) input:not(:disabled)') ?? missing.querySelector<HTMLElement>('[role="radiogroup"]')
  if (target && !target.matches('input')) target.tabIndex = -1
  target?.focus({ preventScroll: true })
  return missing
}

export const mountVariantPickers = (scope: ParentNode = document) => {
  for (const root of scope.querySelectorAll<HTMLElement>('[data-variant-picker]')) mountPicker(root)
}

mountVariantPickers()
