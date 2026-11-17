// Quantity stepper: reveals the − / + buttons around a native number input, clamps the value to its
// min/max, disables the button at a bound and reports every change — a bubbling `change` on the
// input (so a form's own listener sees it) and a `quantity:change` CustomEvent on the root.
const rootSelector = '[data-quantity-stepper]'

export interface QuantityChangeDetail {
  readonly input: HTMLInputElement
  readonly value: number
}

const readBound = (value: string, fallback: number): number => {
  const parsed = Number(value)
  return value !== '' && Number.isFinite(parsed) ? parsed : fallback
}

const clamp = (input: HTMLInputElement, raw: number): number => {
  const min = readBound(input.min, 1)
  const max = readBound(input.max, Number.POSITIVE_INFINITY)
  return Math.min(max, Math.max(min, raw))
}

const syncButtons = (root: HTMLElement, input: HTMLInputElement) => {
  const value = Number(input.value)
  const [decrease, increase] = root.querySelectorAll<HTMLButtonElement>('[data-quantity-step]')
  if (decrease) decrease.disabled = input.disabled || value <= readBound(input.min, 1)
  if (increase) increase.disabled = input.disabled || value >= readBound(input.max, Number.POSITIVE_INFINITY)
}

const mountStepper = (root: HTMLElement) => {
  const input = root.querySelector<HTMLInputElement>('input[type="number"]')
  if (!input || root.dataset.quantityMounted) return
  root.dataset.quantityMounted = 'true'
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-quantity-step]')) button.hidden = false
  syncButtons(root, input)

  const commit = (value: number) => {
    input.value = String(value)
    syncButtons(root, input)
    input.dispatchEvent(new Event('change', { bubbles: true }))
    root.dispatchEvent(new CustomEvent<QuantityChangeDetail>('quantity:change', { bubbles: true, detail: { input, value } }))
  }

  root.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-quantity-step]')
    if (!button || button.disabled) return
    const step = Number(input.step) || 1
    const direction = Number(button.dataset.quantityStep)
    commit(clamp(input, (Number(input.value) || 0) + direction * step))
  })

  // Typing is clamped when the field is left, not on every key, so "12" can be typed through "1".
  input.addEventListener('blur', () => {
    const clamped = clamp(input, Number(input.value) || readBound(input.min, 1))
    if (String(clamped) !== input.value) commit(clamped)
    else syncButtons(root, input)
  })
  input.addEventListener('input', () => syncButtons(root, input))
}

export const mountQuantitySteppers = (scope: ParentNode = document) => {
  for (const root of scope.querySelectorAll<HTMLElement>(rootSelector)) mountStepper(root)
}

mountQuantitySteppers()
