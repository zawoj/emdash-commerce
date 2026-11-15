// The product rail: the prev/next buttons of every `[data-product-rail]` scroll its
// `[data-rail-track]` by about one screenful of cards (smooth unless the visitor prefers reduced
// motion) and are disabled at the ends. Without JS the buttons stay hidden and the track scrolls
// by touch, trackpad or keyboard (it is a focusable region).
const EDGE_TOLERANCE_PX = 2

const init = (rail: HTMLElement): void => {
  const track = rail.querySelector<HTMLElement>('[data-rail-track]')
  const controls = rail.querySelector<HTMLElement>('[data-rail-controls]')
  // The two buttons inside the controls, in order: previous, next.
  const [prev, next] = controls?.querySelectorAll<HTMLButtonElement>('button') ?? []
  if (!track || !controls || !prev || !next) return

  const update = (): void => {
    const maxScroll = track.scrollWidth - track.clientWidth
    const isScrollable = maxScroll > EDGE_TOLERANCE_PX
    controls.hidden = !isScrollable
    prev.disabled = track.scrollLeft <= EDGE_TOLERANCE_PX
    next.disabled = track.scrollLeft >= maxScroll - EDGE_TOLERANCE_PX
  }

  const scrollByPage = (direction: 1 | -1): void => {
    const card = track.querySelector<HTMLElement>('[data-rail-item]')
    const step = card ? card.offsetWidth + parseFloat(getComputedStyle(card.parentElement ?? track).columnGap || '0') : track.clientWidth
    const cards = Math.max(1, Math.floor(track.clientWidth / step))
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    track.scrollBy({ left: direction * cards * step, behavior })
  }

  prev.addEventListener('click', () => scrollByPage(-1))
  next.addEventListener('click', () => scrollByPage(1))
  track.addEventListener('scroll', update, { passive: true })
  new ResizeObserver(update).observe(track)
  update()
}

document.querySelectorAll<HTMLElement>('[data-product-rail]').forEach(init)

export {}
