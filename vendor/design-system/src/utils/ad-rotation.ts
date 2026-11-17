// Rotates the ads of a page in the browser. The server renders every campaign of a slot (all of the
// same priority) as a <template data-ad-candidate>; this picks one per page view, evenly, and swaps
// it into the slot, so only the picked creative's image is ever requested. Without JS the slot keeps
// its <noscript> fallback (the first campaign).
const slotSelector = '[data-ad-slot]'
const templateSelector = 'template[data-ad-candidate]'
const readyAttribute = 'data-ad-ready'

/** The index a `random` in [0, 1) lands on among `count` equal stretches; always an existing index. */
export const pickEvenly = (count: number, random: number): number => Math.min(Math.floor(random * count), Math.max(count - 1, 0))

const mountSlot = (slot: HTMLElement) => {
  if (slot.hasAttribute(readyAttribute)) return
  const templates = [...slot.querySelectorAll<HTMLTemplateElement>(`:scope > ${templateSelector}`)]
  if (templates.length === 0) return
  const chosen = templates[pickEvenly(templates.length, Math.random())]
  slot.replaceChildren(chosen.content.cloneNode(true))
  slot.setAttribute(readyAttribute, '')
}

/** Fills every ad slot of the document. */
export const mountAdSlots = (root: ParentNode = document) => {
  for (const slot of root.querySelectorAll<HTMLElement>(slotSelector)) mountSlot(slot)
}

if (typeof document !== 'undefined') mountAdSlots()
