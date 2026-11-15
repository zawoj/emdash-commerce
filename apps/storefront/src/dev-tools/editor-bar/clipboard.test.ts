import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyText } from './clipboard'

class FakeClipboardItem {
  constructor(public items: Record<string, Promise<Blob>>) {}
}

afterEach(() => vi.unstubAllGlobals())

describe('copyText', () => {
  it('hands a pending prompt to the clipboard as a promise, so the copy stays inside the click', async () => {
    const write = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('ClipboardItem', FakeClipboardItem)
    vi.stubGlobal('navigator', { clipboard: { write, writeText: vi.fn() } })
    expect(await copyText(Promise.resolve('hello'))).toBe(true)
    const item = write.mock.calls[0]![0][0] as FakeClipboardItem
    expect(await (await item.items['text/plain']!).text()).toBe('hello')
  })

  it('writes plain text with writeText', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    expect(await copyText('plain')).toBe(true)
    expect(writeText).toHaveBeenCalledWith('plain')
  })

  it('waits for a promise when ClipboardItem does not exist', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('ClipboardItem', undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    expect(await copyText(Promise.resolve('later'))).toBe(true)
    expect(writeText).toHaveBeenCalledWith('later')
  })

  it('falls back to a textarea when the clipboard API refuses', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } })
    document.execCommand = vi.fn().mockReturnValue(true)
    expect(await copyText('x')).toBe(true)
    expect(document.execCommand).toHaveBeenCalledWith('copy')
  })

  it('reports false when the prompt itself fails', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn() } })
    expect(await copyText(Promise.reject(new Error('boom')))).toBe(false)
  })
})
