// Behaviour of the product details area: a long description collapses to a fixed height with a
// fade and a "Read more" toggle whose height animates. The description sits in a tab panel that is
// hidden (height 0) while another tab is open, so it is measured again when its panel is shown.
// Without this script the whole text is visible.

const COLLAPSED_HEIGHT = 420
/** A text only slightly over the limit is shown whole: hiding a few lines behind a button helps nobody. */
const SLACK = 120

const isReducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches

const mountClamp = (root: HTMLElement, shownEvent: string): void => {
  const clip = root.querySelector<HTMLElement>('[data-pd-clip]')
  const toggle = root.querySelector<HTMLButtonElement>('[data-pd-toggle]')
  const label = toggle?.querySelector<HTMLElement>('[data-pd-label]')
  if (!clip || !toggle || !label || root.dataset.pdReady === 'true') return
  root.dataset.pdReady = 'true'

  const setState = (isExpanded: boolean): void => {
    root.dataset.state = isExpanded ? 'expanded' : 'collapsed'
    toggle.setAttribute('aria-expanded', String(isExpanded))
    label.textContent = isExpanded ? toggle.dataset.lessLabel ?? '' : toggle.dataset.moreLabel ?? ''
  }

  const collapse = (): void => {
    clip.style.maxHeight = `${COLLAPSED_HEIGHT}px`
    toggle.hidden = false
    setState(false)
  }

  const measure = (): void => {
    if (root.dataset.state === 'expanded') return
    const isLong = clip.scrollHeight > COLLAPSED_HEIGHT + SLACK
    if (isLong) return collapse()
    clip.style.maxHeight = ''
    toggle.hidden = true
    delete root.dataset.state
  }
  measure()
  // Images in the text change its height once they load.
  window.addEventListener('load', measure)
  root.closest('[role="tabpanel"], [data-tab-panel]')?.addEventListener(shownEvent, measure)

  toggle.addEventListener('click', () => {
    const isExpanding = root.dataset.state !== 'expanded'
    const instant = isReducedMotion()
    if (isExpanding) {
      setState(true)
      if (instant) return void (clip.style.maxHeight = 'none')
      clip.style.maxHeight = `${clip.scrollHeight}px`
      clip.addEventListener('transitionend', () => void (root.dataset.state === 'expanded' && (clip.style.maxHeight = 'none')), { once: true })
      return
    }
    // Collapse: start from the real height (it may be `none`), then shrink.
    clip.style.maxHeight = `${clip.scrollHeight}px`
    void clip.offsetHeight
    setState(false)
    clip.style.maxHeight = `${COLLAPSED_HEIGHT}px`
    const top = root.getBoundingClientRect().top
    if (top < 0) root.scrollIntoView({ block: 'start', behavior: instant ? 'auto' : 'smooth' })
  })
}

export const mountProductDetails = (shownEvent: string): void => {
  for (const root of document.querySelectorAll<HTMLElement>('[data-pd-text]')) mountClamp(root, shownEvent)
}
