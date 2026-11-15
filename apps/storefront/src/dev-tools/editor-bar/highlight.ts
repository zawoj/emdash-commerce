import { DEV_TOOLS, LIMITS } from './constants'

let timer: number | undefined

const overlay = (): HTMLElement => {
  const existing = document.getElementById(DEV_TOOLS.OVERLAY_ID)
  if (existing) return existing
  const node = document.createElement('div')
  node.id = DEV_TOOLS.OVERLAY_ID
  node.hidden = true
  document.body.append(node)
  return node
}

export const positionOverlay = (rect: DOMRect): void => {
  const node = overlay()
  node.hidden = false
  Object.assign(node.style, { top: `${rect.top}px`, left: `${rect.left}px`, width: `${rect.width}px`, height: `${rect.height}px` })
}

export const hideOverlay = (): void => {
  window.clearTimeout(timer)
  overlay().hidden = true
}

/** Scroll to the element a result points at and outline it for a moment. */
export const highlightSelector = (selector: string): boolean => {
  let element: Element | null = null
  try {
    element = document.querySelector(selector)
  } catch {
    return false
  }
  if (!element) return false
  element.scrollIntoView({ block: 'center', behavior: 'smooth' })
  window.clearTimeout(timer)
  const follow = (): void => positionOverlay(element.getBoundingClientRect())
  follow()
  const interval = window.setInterval(follow, 50)
  timer = window.setTimeout(() => {
    window.clearInterval(interval)
    hideOverlay()
  }, LIMITS.HIGHLIGHT_MS)
  return true
}
