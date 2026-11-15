// The phone action bar's behaviour: a bar that watches an element (`data-action-bar-watch`) is shown while
// that element has scrolled up out of the screen; a press on a bar button with `data-action-bar-proxy` is
// forwarded to that control; `data-action-bar-mirror` keeps the bar's value and button in step with the
// page's buy box (the price of the chosen variant, "Dodawanie…", sold out). The decisions are in
// `action-bar-core.ts`.
import { isActionBarShown } from './action-bar-core'

interface Mirror {
  root: string
  value?: string
  button?: string
}

const setShown = (bar: HTMLElement, isShown: boolean) => {
  bar.dataset.state = isShown ? 'shown' : 'hidden'
  bar.inert = !isShown
}

// An IntersectionObserver alone is not enough: it reports only when the target crosses the screen's edge, so a
// jump (an anchor link, the size prompt's scroll, restored scroll position) that lands past the target in one
// frame never reports it. A rAF-throttled scroll listener re-reads the target's position; the observer still
// covers layout shifts that move the target without a scroll.
const watchTarget = (bar: HTMLElement, selector: string) => {
  const target = document.querySelector<HTMLElement>(selector)
  if (!target) return
  const update = () => {
    const box = target.getBoundingClientRect()
    const isVisible = box.bottom > 0 && box.top < window.innerHeight
    setShown(bar, isActionBarShown({ isIntersecting: isVisible, top: box.top }))
  }
  let isQueued = false
  const queue = () => {
    if (isQueued) return
    isQueued = true
    window.requestAnimationFrame(() => {
      isQueued = false
      update()
    })
  }
  window.addEventListener('scroll', queue, { passive: true })
  window.addEventListener('resize', queue, { passive: true })
  new IntersectionObserver(queue).observe(target)
  update()
}

const labelOf = (control: HTMLElement): HTMLElement => control.querySelector<HTMLElement>('.button__label') ?? control

const mirrorBuyBox = (bar: HTMLElement, mirror: Mirror) => {
  const root = document.querySelector<HTMLElement>(mirror.root)
  if (!root) return
  const value = bar.querySelector<HTMLElement>('[data-action-bar-value]')
  const button = bar.querySelector<HTMLButtonElement>('[data-action-bar-button]')
  const sync = () => {
    const source = mirror.value ? root.querySelector<HTMLElement>(mirror.value) : null
    if (value && source?.textContent) value.textContent = source.textContent.trim()
    const control = mirror.button ? root.querySelector<HTMLButtonElement>(mirror.button) : null
    if (button && control) {
      const text = labelOf(control).textContent?.trim()
      if (text) labelOf(button).textContent = text
      button.disabled = control.disabled
    }
  }
  new MutationObserver(sync).observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['disabled'] })
  sync()
}

const mount = (bar: HTMLElement) => {
  if (bar.dataset.actionBarMounted) return
  bar.dataset.actionBarMounted = 'true'
  const selector = bar.dataset.actionBarWatch
  if (selector) watchTarget(bar, selector)
  const mirror = bar.dataset.actionBarMirror
  if (mirror) mirrorBuyBox(bar, JSON.parse(mirror) as Mirror)
  bar.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLElement>('[data-action-bar-proxy]')
    const proxy = button?.dataset.actionBarProxy
    if (!button || !proxy) return
    event.preventDefault()
    document.querySelector<HTMLElement>(proxy)?.click()
  })
}

for (const bar of document.querySelectorAll<HTMLElement>('[data-action-bar]')) mount(bar)

export {}
