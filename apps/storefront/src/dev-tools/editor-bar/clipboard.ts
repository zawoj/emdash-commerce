const fallbackCopy = (text: string): boolean => {
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.cssText = 'position:fixed;top:-1000px;opacity:0'
  document.body.append(area)
  area.select()
  const isCopied = document.execCommand('copy')
  area.remove()
  return isCopied
}

/**
 * Copy text, or text that is still being produced. Handing the clipboard a promise keeps the copy inside the
 * click that asked for it (Safari drops it otherwise) while the prompt waits for the schema request.
 */
export const copyText = async (source: string | Promise<string>): Promise<boolean> => {
  try {
    if (typeof source !== 'string' && typeof ClipboardItem !== 'undefined') {
      const blob = source.then((text) => new Blob([text], { type: 'text/plain' }))
      // If write() itself fails the rejection below is dealt with by the fallback; this keeps it from going unhandled.
      blob.catch(() => undefined)
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })])
      return true
    }
    await navigator.clipboard.writeText(await source)
    return true
  } catch {
    try {
      return fallbackCopy(await source)
    } catch {
      return false
    }
  }
}
