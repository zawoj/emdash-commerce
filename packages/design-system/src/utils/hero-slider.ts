// The home lead slider: shows one `[data-hero-slide]` at a time inside each `[data-hero-slider]`,
// switched by its `[data-hero-dot]` buttons and, unless the visitor prefers reduced motion, by a
// timer that pauses while the pointer or the focus is on the slider, the tab is hidden, or after
// the visitor picked a slide. Without JS the first slide stays on and the dots stay hidden.
const AUTOPLAY_MS = 7000

const select = (slider: HTMLElement, index: number): void => {
  const slides = slider.querySelectorAll<HTMLElement>('[data-hero-slide]')
  const dots = slider.querySelectorAll<HTMLElement>('[data-hero-dot]')
  slides.forEach((slide, position) => {
    const isActive = position === index
    slide.toggleAttribute('data-active', isActive)
    slide.toggleAttribute('inert', !isActive)
  })
  dots.forEach((dot, position) => {
    const isActive = position === index
    dot.toggleAttribute('data-active', isActive)
    if (isActive) dot.setAttribute('aria-current', 'true')
    else dot.removeAttribute('aria-current')
  })
}

const activeIndex = (slider: HTMLElement): number =>
  Math.max(0, [...slider.querySelectorAll('[data-hero-slide]')].findIndex((slide) => slide.hasAttribute('data-active')))

const init = (slider: HTMLElement): void => {
  const count = slider.querySelectorAll('[data-hero-slide]').length
  if (count < 2) return
  const progress = slider.querySelector<HTMLElement>('[data-hero-progress]')
  if (progress) progress.hidden = false
  select(slider, activeIndex(slider))

  let isPicked = false
  let isHeld = false
  const canAutoplay = !window.matchMedia('(prefers-reduced-motion: reduce)').matches

  slider.querySelectorAll<HTMLElement>('[data-hero-dot]').forEach((dot, position) =>
    dot.addEventListener('click', () => {
      isPicked = true
      select(slider, position)
    }),
  )
  for (const [start, end] of [['pointerenter', 'pointerleave'], ['focusin', 'focusout']] as const) {
    slider.addEventListener(start, () => (isHeld = true))
    slider.addEventListener(end, () => (isHeld = false))
  }
  if (!canAutoplay) return
  window.setInterval(() => {
    if (isPicked || isHeld || document.hidden) return
    select(slider, (activeIndex(slider) + 1) % count)
  }, AUTOPLAY_MS)
}

document.querySelectorAll<HTMLElement>('[data-hero-slider]').forEach(init)
