import { DEV_TOOLS, EMDASH } from './constants'

const STORAGE_KEY = `${DEV_TOOLS.STORAGE_KEY}:collapsed`
const SHORTCUT = 'Alt+Shift+E'

const CHEVRON_DOWN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>'
const HANDLE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><path d="M8 12h8"/></svg>'

const readCollapsed = (): boolean => {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

const writeCollapsed = (isCollapsed: boolean): void => {
  try {
    localStorage.setItem(STORAGE_KEY, isCollapsed ? '1' : '0')
  } catch {
    // storage can be blocked; the state just does not persist
  }
}

const isShortcut = (event: KeyboardEvent): boolean => event.altKey && event.shiftKey && event.code === 'KeyE'

/**
 * EmDash's × removes the pill, clears edit mode and remembers it in localStorage until the next admin visit.
 * Here × only collapses the pill into a round handle (click it, or press Alt+Shift+E, to bring it back);
 * edit mode stays as it was and the choice survives reloads.
 */
export const setupCollapse = (toolbar: HTMLElement): void => {
  const inner = toolbar.querySelector('.emdash-tb-inner')
  const dismiss = document.getElementById(EMDASH.DISMISS_ID)
  if (!inner || toolbar.querySelector(`#${DEV_TOOLS.HANDLE_ID}`)) return

  const handle = document.createElement('button')
  handle.id = DEV_TOOLS.HANDLE_ID
  handle.type = 'button'
  handle.title = `Show the EmDash toolbar (${SHORTCUT})`
  handle.setAttribute('aria-label', handle.title)
  handle.innerHTML = HANDLE_ICON
  toolbar.append(handle)

  const setCollapsed = (isCollapsed: boolean): void => {
    toolbar.classList.toggle(DEV_TOOLS.COLLAPSED_CLASS, isCollapsed)
    writeCollapsed(isCollapsed)
    if (isCollapsed) document.dispatchEvent(new CustomEvent(DEV_TOOLS.COLLAPSED_EVENT))
  }
  const toggle = (): void => setCollapsed(!toolbar.classList.contains(DEV_TOOLS.COLLAPSED_CLASS))

  if (dismiss) {
    dismiss.title = `Hide the toolbar (${SHORTCUT})`
    dismiss.setAttribute('aria-label', dismiss.title)
    dismiss.innerHTML = CHEVRON_DOWN
  }
  // Capture on the pill, so this runs before EmDash's own listener on the button and can stop it.
  inner.addEventListener('click', (event) => {
    if (!(event.target instanceof Element) || !event.target.closest(`#${EMDASH.DISMISS_ID}`)) return
    event.preventDefault()
    event.stopImmediatePropagation()
    setCollapsed(true)
  }, true)
  handle.addEventListener('click', () => setCollapsed(false))
  document.addEventListener('keydown', (event) => {
    if (!isShortcut(event)) return
    event.preventDefault()
    toggle()
  })

  if (readCollapsed()) toolbar.classList.add(DEV_TOOLS.COLLAPSED_CLASS)
}

/**
 * Pills closed with the old × stay gone: EmDash removes the pill before this script runs.
 * Clear that flag, and reload once so the pill comes back.
 */
export const restoreLegacyDismissal = (): void => {
  try {
    if (!localStorage.getItem(EMDASH.DISMISSED_KEY)) return
    localStorage.removeItem(EMDASH.DISMISSED_KEY)
    if (!document.getElementById(EMDASH.TOOLBAR_ID)) location.reload()
  } catch {
    // storage unavailable: nothing was dismissed
  }
}
