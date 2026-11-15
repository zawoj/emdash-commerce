import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeComposer } from './composer'
import { startInspect } from './inspect'

describe('startInspect', () => {
  let stop: (() => void) | null = null

  beforeEach(() => {
    closeComposer()
    document.body.innerHTML = '<main><p id="p">Hello</p><div id="emdash-toolbar"><button id="pill">x</button></div></main>'
  })
  afterEach(() => stop?.())

  it('hands the clicked element to the picker and keeps EmDash’s own click handler from seeing it', () => {
    // EmDash registers this on `document`, in the capture phase, before the add-on starts.
    const emdashClick = vi.fn()
    document.addEventListener('click', emdashClick, true)
    const onPick = vi.fn()
    stop = startInspect(onPick)
    document.getElementById('p')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(onPick).toHaveBeenCalledWith(document.getElementById('p'))
    expect(emdashClick).not.toHaveBeenCalled()
    document.removeEventListener('click', emdashClick, true)
  })

  it('leaves the pill and the add-on’s own UI clickable', () => {
    const onPick = vi.fn()
    const pillClick = vi.fn()
    document.getElementById('pill')!.addEventListener('click', pillClick)
    stop = startInspect(onPick)
    document.getElementById('pill')!.click()
    expect(pillClick).toHaveBeenCalledTimes(1)
    expect(onPick).not.toHaveBeenCalled()
  })

  it('stops intercepting once switched off', () => {
    const onPick = vi.fn()
    const off = startInspect(onPick)
    off()
    document.getElementById('p')!.click()
    expect(onPick).not.toHaveBeenCalled()
  })
})
