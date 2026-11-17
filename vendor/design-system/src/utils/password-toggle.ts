// Password reveal: a `[data-password-toggle]` button switches its field between `password` and
// `text`, keeps `aria-pressed` and swaps its label (`data-show-label` / `data-hide-label`).
const mountToggle = (button: HTMLButtonElement) => {
  const input = document.getElementById(button.dataset.passwordToggle ?? '') as HTMLInputElement | null
  if (!input || button.dataset.passwordMounted) return
  button.dataset.passwordMounted = 'true'
  button.hidden = false
  button.addEventListener('click', () => {
    const isRevealed = input.type === 'text'
    input.type = isRevealed ? 'password' : 'text'
    button.setAttribute('aria-pressed', String(!isRevealed))
    const label = isRevealed ? button.dataset.showLabel : button.dataset.hideLabel
    if (label) button.setAttribute('aria-label', label)
  })
}

export const mountPasswordToggles = (scope: ParentNode = document) => {
  for (const button of scope.querySelectorAll<HTMLButtonElement>('[data-password-toggle]')) mountToggle(button)
}

mountPasswordToggles()
