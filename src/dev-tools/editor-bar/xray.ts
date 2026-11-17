import { DEV_TOOLS, EMDASH } from './constants'
import { islandLabel, parseRef, refLabel } from './ref'
import { isIgnored } from './selector'

const LANDMARKS = 'header, main, footer, nav, aside, section, article'
const MIN_LABEL_WIDTH = 24

const KIND = { FIELD: 'field', ISLAND: 'island', LANDMARK: 'landmark' } as const
type Kind = (typeof KIND)[keyof typeof KIND]

interface Label {
  text: string
  kind: Kind
}

const labelFor = (element: Element): Label | null => {
  if (element.matches(EMDASH.REF_SELECTOR)) {
    const ref = parseRef(element.getAttribute(EMDASH.REF_ATTR))
    if (ref) return { text: refLabel(ref), kind: KIND.FIELD }
  }
  if (element.matches('astro-island')) return { text: islandLabel(element) ?? 'island', kind: KIND.ISLAND }
  if (element.matches(LANDMARKS)) return { text: element.tagName.toLowerCase(), kind: KIND.LANDMARK }
  return null
}

let layer: HTMLElement | null = null
let frame = 0

const render = (): void => {
  if (!layer) return
  const chips = document.createDocumentFragment()
  for (const element of document.body.querySelectorAll(`${EMDASH.REF_SELECTOR}, astro-island, ${LANDMARKS}`)) {
    if (isIgnored(element)) continue
    // <astro-island> is display: contents and has no box of its own — measure what it renders.
    const rect = (element.matches('astro-island') ? (element.firstElementChild ?? element) : element).getBoundingClientRect()
    const label = labelFor(element)
    if (!label || rect.width < MIN_LABEL_WIDTH || rect.height === 0) continue
    const chip = document.createElement('span')
    chip.textContent = label.text
    chip.dataset.kind = label.kind
    chip.style.top = `${rect.top + window.scrollY}px`
    chip.style.left = `${rect.left + window.scrollX}px`
    chips.append(chip)
  }
  layer.replaceChildren(chips)
}

const schedule = (): void => {
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(render)
}

export const setXray = (isOn: boolean): void => {
  document.documentElement.classList.toggle(DEV_TOOLS.XRAY_CLASS, isOn)
  if (!isOn) {
    window.removeEventListener('resize', schedule)
    layer?.remove()
    layer = null
    return
  }
  layer = document.createElement('div')
  layer.id = DEV_TOOLS.LABELS_ID
  document.body.append(layer)
  window.addEventListener('resize', schedule)
  render()
}
