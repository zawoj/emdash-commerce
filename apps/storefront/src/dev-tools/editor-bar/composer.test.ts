import { beforeEach, describe, expect, it, vi } from 'vitest'
import { closeComposer, isComposerOpen, openComposer } from './composer'
import { DEV_TOOLS } from './constants'

const handlers = () => ({ onAdd: vi.fn().mockResolvedValue(undefined), onCopy: vi.fn().mockResolvedValue(true), onClose: vi.fn() })
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

const composer = (): HTMLElement => document.getElementById(DEV_TOOLS.COMPOSER_ID)!
const button = (act: string): HTMLButtonElement => composer().querySelector<HTMLButtonElement>(`[data-act="${act}"]`)!
const type = (text: string): void => {
  const area = composer().querySelector('textarea')!
  area.value = text
  area.dispatchEvent(new Event('input'))
}

describe('openComposer', () => {
  beforeEach(() => {
    closeComposer()
    document.body.innerHTML = '<main id="m"><h1 id="t" data-emdash-ref=\'{"collection":"posts","id":"01A","field":"title"}\'>Title</h1></main>'
  })

  it('opens next to the element, labelled with its CMS field and linking to the admin', () => {
    openComposer(document.getElementById('t')!, handlers())
    expect(isComposerOpen()).toBe(true)
    expect(composer().querySelector('header b')?.textContent).toBe('posts › title')
    expect(composer().querySelector('footer a')?.getAttribute('href')).toBe('/_emdash/admin/content/posts/01A')
  })

  it('keeps Add and Copy disabled until there is a comment', () => {
    openComposer(document.getElementById('t')!, handlers())
    expect(button('add').disabled).toBe(true)
    expect(button('copy').disabled).toBe(true)
    type('  ')
    expect(button('add').disabled).toBe(true)
    type('shorter')
    expect(button('add').disabled).toBe(false)
    expect(button('copy').disabled).toBe(false)
  })

  it('Add hands over the comment and the element description, then closes', async () => {
    const h = handlers()
    openComposer(document.getElementById('t')!, h)
    type('Make it shorter')
    button('add').click()
    await flush()
    expect(h.onAdd).toHaveBeenCalledWith('Make it shorter', expect.objectContaining({ tag: 'h1', ref: expect.objectContaining({ field: 'title' }) }))
    expect(h.onClose).toHaveBeenCalledTimes(1)
  })

  it('Copy prompt reports the result on the button before closing', async () => {
    vi.useFakeTimers()
    const h = handlers()
    openComposer(document.getElementById('t')!, h)
    type('x')
    button('copy').click()
    await vi.advanceTimersByTimeAsync(0)
    expect(h.onCopy).toHaveBeenCalledTimes(1)
    expect(button('copy').textContent).toBe('Copied ✓')
    await vi.advanceTimersByTimeAsync(1000)
    expect(h.onClose).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('↑ Parent re-targets the comment at the parent element', async () => {
    const h = handlers()
    openComposer(document.getElementById('t')!, h)
    button('parent').click()
    expect(composer().querySelector('header b')?.textContent).toBe('main')
    type('wrap it')
    button('add').click()
    await flush()
    expect(h.onAdd).toHaveBeenCalledWith('wrap it', expect.objectContaining({ tag: 'main', selector: '#m' }))
  })

  it('Escape in the box and the × close it without saving', () => {
    const h = handlers()
    openComposer(document.getElementById('t')!, h)
    composer().querySelector('textarea')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    button('cancel').click()
    expect(h.onClose).toHaveBeenCalledTimes(2)
    expect(h.onAdd).not.toHaveBeenCalled()
  })

  it('only one box is open at a time', () => {
    openComposer(document.getElementById('t')!, handlers())
    openComposer(document.getElementById('m')!, handlers())
    expect(document.querySelectorAll(`#${DEV_TOOLS.COMPOSER_ID}`)).toHaveLength(1)
  })

  it('stays open and says why when the comment cannot be saved', async () => {
    const h = handlers()
    h.onAdd.mockRejectedValue(new Error('The "feedback" collection does not exist'))
    openComposer(document.getElementById('t')!, h)
    type('x')
    button('add').click()
    await flush()
    expect(h.onClose).not.toHaveBeenCalled()
    const box = composer().querySelector<HTMLElement>('.dt-error')!
    expect(box.hidden).toBe(false)
    expect(box.textContent).toContain('feedback')
    expect(button('add').disabled).toBe(false)
  })

  it('shows the same error when Copy prompt cannot save the comment first', async () => {
    const h = handlers()
    h.onCopy.mockRejectedValue(new Error('Not allowed'))
    openComposer(document.getElementById('t')!, h)
    type('x')
    button('copy').click()
    await flush()
    expect(composer().querySelector('.dt-error')?.textContent).toBe('Not allowed')
    expect(h.onClose).not.toHaveBeenCalled()
  })
})
