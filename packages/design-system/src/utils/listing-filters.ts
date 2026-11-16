// Listing filters and sort: GET forms that work without a script. The script (a) opens the filter dialog from the
// toolbar's `[data-listing-filters-open]` button (the browser traps focus and closes on Escape; this adds
// `aria-expanded`, closing on a click on the backdrop or the close button, focus back to the button, and a reset of
// the choices that were never applied, so closing a panel changes nothing), (b) tidies every `[data-listing-form]`
// before it submits (a blank value never reaches the URL, a form with nothing left goes to the bare path) and
// (c) submits a `[data-auto-submit]` form on change (the sort select).
const CHANGE_EVENT = 'change'

const syncExpanded = (opener: HTMLElement, isOpen: boolean) => opener.setAttribute('aria-expanded', String(isOpen))

const mountDialog = (dialog: HTMLDialogElement) => {
  if (dialog.dataset.dialogMounted) return
  dialog.dataset.dialogMounted = 'true'
  const openers = [...document.querySelectorAll<HTMLElement>(`[data-listing-filters-open][aria-controls="${dialog.id}"]`)]
  const form = dialog.querySelector<HTMLFormElement>('form')
  let lastOpener: HTMLElement | null = null

  for (const opener of openers) {
    syncExpanded(opener, false)
    opener.addEventListener('click', () => {
      if (dialog.open) return
      lastOpener = opener
      dialog.showModal()
      syncExpanded(opener, true)
    })
  }

  // A click whose target is the dialog itself landed on the backdrop, outside the panel.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close()
  })
  for (const close of dialog.querySelectorAll<HTMLElement>('[data-filters-close]')) close.addEventListener('click', () => dialog.close())

  dialog.addEventListener('close', () => {
    for (const opener of openers) syncExpanded(opener, false)
    // Choices made in the panel and never applied are dropped: the form goes back to what the page shows, and the
    // listeners on `change` (the live counts) are told.
    if (form) {
      form.reset()
      form.dispatchEvent(new Event(CHANGE_EVENT, { bubbles: true }))
    }
    lastOpener?.focus()
  })
}

const mountForm = (form: HTMLFormElement) => {
  if (form.dataset.listingFormMounted) return
  form.dataset.listingFormMounted = 'true'
  for (const button of form.querySelectorAll<HTMLElement>('[data-auto-submit-hide]')) button.hidden = true
  // Blank fields never reach the URL: `?price=` becomes no parameter at all.
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
  if (form.hasAttribute('data-auto-submit')) form.addEventListener(CHANGE_EVENT, () => form.requestSubmit())
}

export const mountListingFilters = (scope: ParentNode = document) => {
  for (const dialog of scope.querySelectorAll<HTMLDialogElement>('dialog[data-listing-filters]')) mountDialog(dialog)
  for (const form of scope.querySelectorAll<HTMLFormElement>('form[data-listing-form], form[data-auto-submit]')) mountForm(form)
}

mountListingFilters()
