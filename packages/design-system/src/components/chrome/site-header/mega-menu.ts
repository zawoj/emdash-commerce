// Behaviour of the desktop mega menu. One panel is open at a time. The (keyboard) disclosure button
// toggles it (click, Enter, Space); a mouse opens it on hover intent (a short delay in, a longer one out)
// and moving to another top item swaps the panels after a short dwell, so a diagonal walk from an item
// down to its panel — which can brush the neighbouring item — keeps the panel it started from: entering
// the panel (a descendant of its item) cancels the pending swap. The panel is flush with the bar and the
// items touch each other, so the pointer has no dead zone to cross. Escape closes and returns focus to the
// item's button; a click on the page scrim, the window losing focus, scrolling the page or focus leaving
// the item closes it too. Touch (a wide tablet): the first tap on a top item that has a panel opens the
// panel, the second tap follows the link — there is no hover, and the disclosure button is hidden.
const OPEN_DELAY = 100
const SWAP_DELAY = 90
const CLOSE_DELAY = 200
const SCROLL_CLOSE_DISTANCE = 8

const ITEM = '[data-site-menu-item]'
const TOGGLE = '[data-site-submenu-toggle]'
const PANEL = '[data-site-mega]'

const isDesktop = (): boolean => window.matchMedia('(min-width: 1101px)').matches

export const initMegaMenu = (): void => {
  const header = document.querySelector<HTMLElement>('.site-header')
  const bar = document.querySelector<HTMLElement>('.site-header__mainbar')
  // A gallery specimen of the open state stays open: the page scrolling or blurring does not close it.
  const isStatic = header?.hasAttribute('data-mega-static') ?? false
  const scrim = document.querySelector<HTMLElement>('[data-site-mega-scrim]')
  if (!header || !bar) return
  const items = [...document.querySelectorAll<HTMLElement>(ITEM)].filter((item) => item.querySelector(PANEL))
  let openItem: HTMLElement | null = items.find((item) => item.hasAttribute('data-open')) ?? null
  let timer: number | undefined
  let scrollAtOpen = 0

  const clearTimer = () => {
    window.clearTimeout(timer)
    timer = undefined
  }

  const render = (next: HTMLElement | null) => {
    for (const item of items) {
      const isOpen = item === next
      item.toggleAttribute('data-open', isOpen)
      item.querySelector(TOGGLE)?.setAttribute('aria-expanded', String(isOpen))
    }
    header.toggleAttribute('data-mega-open', next !== null)
  }

  const setOpen = (next: HTMLElement | null) => {
    if (next === openItem) return
    const isSwap = next !== null && openItem !== null
    if (isSwap) {
      header.setAttribute('data-mega-switching', '')
      requestAnimationFrame(() => requestAnimationFrame(() => header.removeAttribute('data-mega-switching')))
    }
    openItem = next
    scrollAtOpen = window.scrollY
    render(next)
  }

  const schedule = (next: HTMLElement | null, delay: number) => {
    clearTimer()
    timer = window.setTimeout(() => setOpen(next), delay)
  }

  const isMouse = (event: PointerEvent): boolean => event.pointerType === 'mouse' && isDesktop()

  let lastPointerType = 'mouse'
  bar.addEventListener('pointerdown', (event) => {
    lastPointerType = event.pointerType
  })

  for (const item of items) {
    item.querySelector<HTMLElement>('[data-site-menu-link]')?.addEventListener('click', (event) => {
      const isTouchTap = lastPointerType !== 'mouse' && event.detail > 0
      if (!isTouchTap || !isDesktop() || openItem === item) return
      event.preventDefault()
      clearTimer()
      setOpen(item)
    })
    item.querySelector(TOGGLE)?.addEventListener('click', () => {
      clearTimer()
      setOpen(openItem === item ? null : item)
    })
    item.addEventListener('pointerenter', (event) => {
      if (isMouse(event)) schedule(item, openItem ? SWAP_DELAY : OPEN_DELAY)
    })
    item.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || item !== openItem) return
      const isFocusInside = item.contains(document.activeElement)
      setOpen(null)
      if (isFocusInside) item.querySelector<HTMLElement>(TOGGLE)?.focus()
    })
    item.addEventListener('focusout', (event) => {
      if (event.relatedTarget instanceof Node && item.contains(event.relatedTarget)) return
      if (item === openItem && event.relatedTarget) setOpen(null)
    })
  }

  // A top item without a panel next to an open one: the open panel leaves with the pointer.
  for (const link of bar.querySelectorAll<HTMLElement>(`${ITEM}:not(:has(${PANEL}))`)) {
    link.addEventListener('pointerenter', (event) => {
      if (isMouse(event) && openItem) schedule(null, OPEN_DELAY)
    })
  }

  bar.addEventListener('pointerenter', (event) => {
    if (isMouse(event)) clearTimer()
  })
  bar.addEventListener('pointerleave', (event) => {
    if (isMouse(event) && openItem) schedule(null, CLOSE_DELAY)
  })
  scrim?.addEventListener('click', () => {
    clearTimer()
    setOpen(null)
  })
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && openItem) setOpen(null)
  })
  document.addEventListener('click', (event) => {
    if (openItem && event.target instanceof Node && !bar.contains(event.target)) setOpen(null)
  })
  window.addEventListener(
    'scroll',
    () => {
      if (!isStatic && openItem && Math.abs(window.scrollY - scrollAtOpen) > SCROLL_CLOSE_DISTANCE) setOpen(null)
    },
    { passive: true },
  )
  window.addEventListener('blur', () => {
    if (!isStatic) setOpen(null)
  })
  window.matchMedia('(min-width: 1101px)').addEventListener('change', () => setOpen(null))
}
