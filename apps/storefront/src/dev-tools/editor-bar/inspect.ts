import { DEV_TOOLS } from './constants'
import { hideOverlay, positionOverlay } from './highlight'
import { isComposerOpen } from './composer'
import { islandLabel, refLabel, refOf } from './ref'
import { isIgnored } from './selector'

const SOURCE_ATTR = 'data-astro-source-file'

const escapeHtml = (value: string): string => value.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)

const tooltip = (): HTMLElement => {
  const existing = document.getElementById(DEV_TOOLS.TOOLTIP_ID)
  if (existing) return existing
  const node = document.createElement('div')
  node.id = DEV_TOOLS.TOOLTIP_ID
  node.hidden = true
  document.body.append(node)
  return node
}

const describe = (element: Element): string => {
  const rect = element.getBoundingClientRect()
  const className = [...element.classList].slice(0, 3).join('.')
  const lines = [`<b>${escapeHtml(element.tagName.toLowerCase())}${element.id ? `#${escapeHtml(element.id)}` : ''}${className ? `.${escapeHtml(className)}` : ''}</b> ${Math.round(rect.width)}×${Math.round(rect.height)}`]
  const ref = refOf(element)
  if (ref) lines.push(`<span class="dt-field">field: ${escapeHtml(refLabel(ref))}${ref.status ? ` · ${escapeHtml(ref.status)}` : ''}</span>`)
  const island = islandLabel(element)
  if (island) lines.push(`<span class="dt-island">island: ${escapeHtml(island)}</span>`)
  const source = element.closest(`[${SOURCE_ATTR}]`)?.getAttribute(SOURCE_ATTR)
  if (source) lines.push(`source: ${escapeHtml(source.split('/src/').pop() ?? source)}`)
  lines.push('<span class="dt-hint">click to comment</span>')
  return lines.join('<br>')
}

const place = (node: HTMLElement, x: number, y: number): void => {
  const gap = 14
  const { width, height } = node.getBoundingClientRect()
  node.style.left = `${Math.min(x + gap, window.innerWidth - width - 8)}px`
  node.style.top = `${y + gap + height > window.innerHeight ? y - height - gap : y + gap}px`
}

const targetAt = (event: Event): Element | null => (event.target instanceof Element && !isIgnored(event.target) ? event.target : null)

/** Hover tooltip + outline; a click picks the element for a comment. Returns the stop function. */
export const startInspect = (onPick: (element: Element) => void): (() => void) => {
  const tip = tooltip()

  const onMove = (event: MouseEvent): void => {
    // The comment box keeps the picked element outlined; hovering must not move it.
    if (isComposerOpen()) return
    const element = targetAt(event)
    if (!element) {
      tip.hidden = true
      hideOverlay()
      return
    }
    positionOverlay(element.getBoundingClientRect())
    tip.innerHTML = describe(element)
    tip.hidden = false
    place(tip, event.clientX, event.clientY)
  }

  // A click that picks an element must not also start EmDash's own inline editing (it listens on `document` in
  // the capture phase, registered before this code), so the picker listens on `window`, which is reached first.
  const swallow = (event: MouseEvent): void => {
    event.preventDefault()
    event.stopPropagation()
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (targetAt(event)) swallow(event)
  }

  const onClick = (event: MouseEvent): void => {
    const element = targetAt(event)
    if (!element) return
    swallow(event)
    tip.hidden = true
    onPick(element)
  }

  document.addEventListener('mousemove', onMove, true)
  window.addEventListener('mousedown', onMouseDown, true)
  window.addEventListener('click', onClick, true)
  return () => {
    document.removeEventListener('mousemove', onMove, true)
    window.removeEventListener('mousedown', onMouseDown, true)
    window.removeEventListener('click', onClick, true)
    tip.hidden = true
    hideOverlay()
  }
}
