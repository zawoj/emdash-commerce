import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEV_TOOLS, EMDASH } from './constants'
import { restoreLegacyDismissal, setupCollapse } from './collapse'

const PILL = `<div id="emdash-toolbar"><div class="emdash-tb-inner"><span>EmDash</span><button id="emdash-tb-dismiss">&times;</button></div></div>`

const COLLAPSED_KEY = `${DEV_TOOLS.STORAGE_KEY}:collapsed`

const setup = (): { toolbar: HTMLElement; emdashDismiss: ReturnType<typeof vi.fn> } => {
  document.body.innerHTML = PILL
  const toolbar = document.getElementById('emdash-toolbar')!
  // EmDash registers its own listener on the button first, as its inline script does.
  const emdashDismiss = vi.fn()
  document.getElementById('emdash-tb-dismiss')!.addEventListener('click', emdashDismiss)
  setupCollapse(toolbar)
  return { toolbar, emdashDismiss }
}

describe('setupCollapse', () => {
  beforeEach(() => localStorage.clear())

  it('× collapses the pill and never reaches EmDash’s close handler', () => {
    const { toolbar, emdashDismiss } = setup()
    document.getElementById('emdash-tb-dismiss')!.click()
    expect(toolbar.classList.contains(DEV_TOOLS.COLLAPSED_CLASS)).toBe(true)
    expect(emdashDismiss).not.toHaveBeenCalled()
    expect(localStorage.getItem(EMDASH.DISMISSED_KEY)).toBeNull()
    expect(localStorage.getItem(COLLAPSED_KEY)).toBe('1')
  })

  it('the handle brings the pill back', () => {
    const { toolbar } = setup()
    document.getElementById('emdash-tb-dismiss')!.click()
    document.getElementById(DEV_TOOLS.HANDLE_ID)!.click()
    expect(toolbar.classList.contains(DEV_TOOLS.COLLAPSED_CLASS)).toBe(false)
    expect(localStorage.getItem(COLLAPSED_KEY)).toBe('0')
  })

  it('Alt+Shift+E toggles it', () => {
    const { toolbar } = setup()
    const press = (): boolean => document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', altKey: true, shiftKey: true, cancelable: true }))
    press()
    expect(toolbar.classList.contains(DEV_TOOLS.COLLAPSED_CLASS)).toBe(true)
    press()
    expect(toolbar.classList.contains(DEV_TOOLS.COLLAPSED_CLASS)).toBe(false)
  })

  it('starts collapsed when it was collapsed before the reload', () => {
    localStorage.setItem(COLLAPSED_KEY, '1')
    const { toolbar } = setup()
    expect(toolbar.classList.contains(DEV_TOOLS.COLLAPSED_CLASS)).toBe(true)
  })

  it('announces the collapse so open panels can close', () => {
    const { toolbar } = setup()
    const listener = vi.fn()
    document.addEventListener(DEV_TOOLS.COLLAPSED_EVENT, listener)
    document.getElementById('emdash-tb-dismiss')!.click()
    expect(listener).toHaveBeenCalledTimes(1)
    toolbar.querySelector<HTMLElement>(`#${DEV_TOOLS.HANDLE_ID}`)!.click()
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe('restoreLegacyDismissal', () => {
  beforeEach(() => {
    localStorage.clear()
    document.body.innerHTML = ''
  })

  it('does nothing when the pill was never dismissed', () => {
    const reload = vi.spyOn(location, 'reload').mockImplementation(() => undefined)
    restoreLegacyDismissal()
    expect(reload).not.toHaveBeenCalled()
  })

  it('clears the old flag and reloads once when the pill is missing', () => {
    const reload = vi.spyOn(location, 'reload').mockImplementation(() => undefined)
    localStorage.setItem(EMDASH.DISMISSED_KEY, '1')
    restoreLegacyDismissal()
    expect(localStorage.getItem(EMDASH.DISMISSED_KEY)).toBeNull()
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
