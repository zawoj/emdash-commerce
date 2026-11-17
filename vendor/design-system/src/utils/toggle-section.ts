// Toggle section: the checkbox reveals its fieldset in CSS (`:has(:checked)`); this keeps the
// fieldset `disabled` while it is hidden, so its controls are neither validated nor submitted.
const mountSection = (root: HTMLElement) => {
  const checkbox = root.querySelector<HTMLInputElement>('[data-toggle-section-input]')
  const panel = root.querySelector<HTMLFieldSetElement>('[data-toggle-section-panel]')
  if (!checkbox || !panel || root.dataset.toggleMounted) return
  root.dataset.toggleMounted = 'true'
  const sync = () => {
    panel.disabled = !checkbox.checked
  }
  checkbox.addEventListener('change', sync)
  sync()
}

export const mountToggleSections = (scope: ParentNode = document) => {
  for (const root of scope.querySelectorAll<HTMLElement>('[data-toggle-section]')) mountSection(root)
}

mountToggleSections()
