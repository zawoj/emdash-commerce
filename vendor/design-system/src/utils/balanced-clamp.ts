// Balanced + clamped text, as Figma draws it: Figma balances the WHOLE text (`text-balance`) and
// then cuts it after N lines with an ellipsis. Chrome skips `text-wrap: balance` on a
// `-webkit-line-clamp` box and wraps greedily, so its cut lines differ. For every element marked
// `data-balanced-clamp` this lays the text out balanced and unclamped, pins those line breaks with
// <br>s, and hands the element back to the clamp — which then only adds the ellipsis. Re-runs when
// the element's width changes. Without JS the text keeps the plain (greedy) clamp.
const selector = '[data-balanced-clamp]'
const breakAttribute = 'data-balanced-clamp-break'
const breakBefore = /[\s\-–/]/

interface LineStart {
  readonly node: Text
  readonly offset: number
}

const textNodes = (element: Element): Text[] => {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node as Text)
  return nodes
}

const removeBreaks = (element: Element) => {
  for (const br of element.querySelectorAll(`[${breakAttribute}]`)) br.remove()
  element.normalize()
}

/** Every position where a new visual line starts (except the first). */
const findLineStarts = (element: Element): LineStart[] => {
  const range = document.createRange()
  const starts: LineStart[] = []
  let lastTop: number | undefined
  for (const node of textNodes(element)) {
    const text = node.data
    for (let offset = 0; offset < text.length; offset++) {
      const isWordStart = offset === 0 || breakBefore.test(text[offset - 1] ?? '')
      if (!isWordStart || /\s/.test(text[offset] ?? '')) continue
      range.setStart(node, offset)
      range.setEnd(node, offset + 1)
      const rect = range.getClientRects()[0]
      if (!rect) continue
      if (lastTop !== undefined && rect.top > lastTop + 1) starts.push({ node, offset })
      lastTop = rect.top
    }
  }
  return starts
}

const pinBalancedLines = (element: HTMLElement) => {
  removeBreaks(element)
  element.style.setProperty('display', 'block')
  element.style.setProperty('-webkit-line-clamp', 'none')
  const starts = findLineStarts(element)
  element.style.removeProperty('display')
  element.style.removeProperty('-webkit-line-clamp')
  // Insert from the end so earlier offsets stay valid.
  for (const { node, offset } of starts.reverse()) {
    const rest = node.splitText(offset)
    const br = document.createElement('br')
    br.setAttribute(breakAttribute, '')
    rest.before(br)
  }
}

const widths = new WeakMap<Element, number>()
const observer = new ResizeObserver((entries) => {
  for (const entry of entries) {
    const width = Math.round(entry.contentRect.width)
    if (widths.get(entry.target) === width) continue
    widths.set(entry.target, width)
    pinBalancedLines(entry.target as HTMLElement)
  }
})

void document.fonts.ready.then(() => {
  for (const element of document.querySelectorAll<HTMLElement>(selector)) observer.observe(element)
})
