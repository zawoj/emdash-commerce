// Listing filters and sort: a GET form that works without a script. The script (a) collapses the
// filter panel below 900px, applied filters or not (it is open in the markup; the applied filters
// stay visible above it as chips), (b) opens it from the toolbar's
// `[data-listing-filters-open]` link (the one entry point on a phone: the panel's own summary row is hidden there; the
// link toggles the panel with the details animation and mirrors it in `aria-expanded`), and (c) submits a `[data-auto-submit]` form on change —
// at once for checkboxes, radios and selects, after a pause for typed numbers.
import { toggleDetails } from './details-motion'

const narrowQuery = '(max-width: 899px)'
const typingDelay = 600

// A change submitted from an open panel reloads the page; the panel stays open for that one load so
// a shopper can keep choosing, and any other visit starts collapsed.
const keepOpenKey = 'listing-filters-open'

const wasJustSubmitted = (): boolean => {
  try {
    const flag = window.sessionStorage.getItem(keepOpenKey)
    window.sessionStorage.removeItem(keepOpenKey)
    return flag === '1'
  } catch {
    return false
  }
}

const rememberOpen = () => {
  try {
    window.sessionStorage.setItem(keepOpenKey, '1')
  } catch {
    // Storage blocked: the panel simply starts collapsed after the reload.
  }
}

const collapseOnNarrow = (panel: HTMLDetailsElement) => {
  if (window.matchMedia(narrowQuery).matches && !wasJustSubmitted()) panel.open = false
}

const mountAutoSubmit = (form: HTMLFormElement) => {
  if (form.dataset.autoSubmitMounted) return
  form.dataset.autoSubmitMounted = 'true'
  let timer: number | undefined
  for (const button of form.querySelectorAll<HTMLElement>('[data-auto-submit-hide]')) button.hidden = true
  // Blank fields (an empty price bound) never reach the URL: `?priceMin=&priceMax=` becomes no parameter at all.
  form.addEventListener('formdata', (event) => {
    for (const [name, value] of [...event.formData]) if (typeof value === 'string' && value.trim() === '') event.formData.delete(name)
  })
  // A form left with no field at all goes to the bare path, not to `path?`.
  form.addEventListener('submit', (event) => {
    const hasValue = [...new FormData(form)].some(([, value]) => typeof value !== 'string' || value.trim() !== '')
    if (hasValue) return
    event.preventDefault()
    window.location.assign(new URL(form.action, window.location.href).pathname)
  })
  form.addEventListener('change', (event) => {
    const target = event.target as HTMLInputElement
    window.clearTimeout(timer)
    rememberOpen()
    if (target.type === 'number' || target.type === 'text') timer = window.setTimeout(() => form.requestSubmit(), typingDelay)
    else form.requestSubmit()
  })
}

export const mountListingFilters = (scope: ParentNode = document) => {
  for (const panel of scope.querySelectorAll<HTMLDetailsElement>('details[data-listing-filters]')) {
    if (panel.dataset.filtersMounted) continue
    panel.dataset.filtersMounted = 'true'
    collapseOnNarrow(panel)
  }
  for (const form of scope.querySelectorAll<HTMLFormElement>('form[data-auto-submit]')) mountAutoSubmit(form)
  for (const button of scope.querySelectorAll<HTMLElement>('[data-filters-show-results]')) {
    if (button.dataset.showResultsMounted) continue
    button.dataset.showResultsMounted = 'true'
    // The phone's bottom bar: fold the panel (the toolbar link mirrors its state) and land on the results under it.
    button.addEventListener('click', () => {
      const panel = button.closest<HTMLDetailsElement>('details[data-listing-filters]')
      if (!panel) return
      toggleDetails(panel, false)
      const results = panel.parentElement?.nextElementSibling ?? panel
      results.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }
  for (const link of scope.querySelectorAll<HTMLAnchorElement>('[data-listing-filters-open]')) {
    if (link.dataset.filtersOpenMounted) continue
    link.dataset.filtersOpenMounted = 'true'
    const panel = document.getElementById(link.getAttribute('href')?.slice(1) ?? '') as HTMLDetailsElement | null
    if (!panel) continue
    const isShown = () => panel.open && !panel.hasAttribute('data-closing')
    const sync = () => link.setAttribute('aria-expanded', String(isShown()))
    link.setAttribute('aria-controls', panel.id)
    sync()
    panel.addEventListener('toggle', sync)
    link.addEventListener('click', (event) => {
      event.preventDefault()
      const shouldOpen = !isShown()
      toggleDetails(panel, shouldOpen)
      sync()
      if (shouldOpen) panel.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }
}

mountListingFilters()
