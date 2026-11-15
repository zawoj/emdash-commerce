// Links the hotspots of a "shop the look" photo to the product rows beside it. Activating a hotspot
// (click, Enter) marks its row active and brings it into view; hovering or focusing a row marks its
// hotspot. Without JS a hotspot is a plain in-page link to its row.
const rootSelector = '[data-shop-the-look]'
const hotspotSelector = '[data-look-hotspot]'
const rowSelector = '[data-look-row]'
const readyAttribute = 'data-look-ready'

/** The index of the next hotspot for an arrow key, wrapping around; the same index for any other key. */
export const nextHotspotIndex = (key: string, current: number, count: number): number => {
  if (count === 0) return current
  if (key === 'ArrowRight' || key === 'ArrowDown') return (current + 1) % count
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (current - 1 + count) % count
  return current
}

const mountLook = (root: HTMLElement) => {
  if (root.hasAttribute(readyAttribute)) return
  root.setAttribute(readyAttribute, '')
  const hotspots = [...root.querySelectorAll<HTMLElement>(hotspotSelector)]
  const rows = [...root.querySelectorAll<HTMLElement>(rowSelector)]

  const activate = (rowId: string | null) => {
    for (const row of rows) row.dataset.active = String(row.id === rowId)
    for (const hotspot of hotspots) {
      if (hotspot.dataset.lookHotspot === rowId) hotspot.setAttribute('aria-current', 'true')
      else hotspot.removeAttribute('aria-current')
    }
  }

  hotspots.forEach((hotspot, index) => {
    const rowId = hotspot.dataset.lookHotspot ?? null
    hotspot.addEventListener('click', (event) => {
      event.preventDefault()
      activate(rowId)
      const row = rows.find((candidate) => candidate.id === rowId)
      const isReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      row?.scrollIntoView({ block: 'nearest', behavior: isReduced ? 'auto' : 'smooth' })
      row?.focus({ preventScroll: true })
    })
    hotspot.addEventListener('keydown', (event) => {
      const next = nextHotspotIndex(event.key, index, hotspots.length)
      if (next === index) return
      event.preventDefault()
      hotspots[next].focus()
    })
  })

  for (const row of rows) {
    row.addEventListener('mouseenter', () => activate(row.id))
    row.addEventListener('focusin', () => activate(row.id))
    row.addEventListener('mouseleave', () => {
      if (!row.contains(document.activeElement)) activate(null)
    })
  }
}

/** Wires every shop-the-look section of the document. */
export const mountShopTheLook = (scope: ParentNode = document) => {
  for (const root of scope.querySelectorAll<HTMLElement>(rootSelector)) mountLook(root)
}
