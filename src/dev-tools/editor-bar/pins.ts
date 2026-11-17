import { DEV_TOOLS } from './constants'
import type { Annotation } from './types'

let layer: HTMLElement | null = null
let frame = 0
let current: readonly Annotation[] = []

const ensureLayer = (): HTMLElement => {
  if (layer?.isConnected) return layer
  layer = document.createElement('div')
  layer.id = DEV_TOOLS.PINS_ID
  document.body.append(layer)
  return layer
}

const find = (selector: string): Element | null => {
  try {
    return document.querySelector(selector)
  } catch {
    return null
  }
}

const render = (): void => {
  const pins = document.createDocumentFragment()
  current.forEach((annotation, index) => {
    const element = find(annotation.element.selector)
    if (!element) return
    const rect = element.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) return
    const pin = document.createElement('span')
    pin.textContent = String(index + 1)
    pin.title = annotation.comment
    pin.style.top = `${rect.top + window.scrollY - 9}px`
    pin.style.left = `${rect.left + window.scrollX - 9}px`
    pins.append(pin)
  })
  ensureLayer().replaceChildren(pins)
}

const schedule = (): void => {
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(render)
}

/** Numbered markers on the elements that have a comment. Positions follow window resizes. */
export const showPins = (annotations: readonly Annotation[]): void => {
  current = annotations
  schedule()
}

window.addEventListener('resize', schedule)
