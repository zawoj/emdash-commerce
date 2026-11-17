import { LIMITS } from './constants'
import { islandLabel, refOf } from './ref'
import { cssPath } from './selector'
import type { ElementInfo } from './types'

const SOURCE_FILE_ATTR = 'data-astro-source-file'
const SOURCE_LOC_ATTR = 'data-astro-source-loc'

const snippet = (text: string): string => {
  const collapsed = text.replace(/\s+/g, ' ').trim()
  return collapsed.length > LIMITS.TEXT_SNIPPET ? `${collapsed.slice(0, LIMITS.TEXT_SNIPPET)}…` : collapsed
}

const sourceOf = (element: Element): string | null => {
  const holder = element.closest(`[${SOURCE_FILE_ATTR}]`)
  const file = holder?.getAttribute(SOURCE_FILE_ATTR)
  if (!holder || !file) return null
  const location = holder.getAttribute(SOURCE_LOC_ATTR)
  return `${file.split('/src/').pop() ?? file}${location ? `:${location}` : ''}`
}

/** Everything a person (or an AI agent) needs to find this element again in the code or the CMS. */
export const describeElement = (element: Element): ElementInfo => {
  const rect = element.getBoundingClientRect()
  const info: ElementInfo = {
    tag: element.tagName.toLowerCase(),
    classNames: [...element.classList],
    selector: cssPath(element),
    text: snippet(element.textContent ?? ''),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    ref: refOf(element),
    island: islandLabel(element),
    source: sourceOf(element),
  }
  if (element.id) info.id = element.id
  const anchor = element.closest('a')
  if (anchor?.getAttribute('href')) info.href = anchor.getAttribute('href') ?? undefined
  if (element instanceof HTMLImageElement) {
    info.src = element.getAttribute('src') ?? undefined
    info.alt = element.alt
  }
  return info
}
