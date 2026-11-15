// Cart count badges: every `[data-count-badge]` follows `cart:changed` (`detail: { count }`). The
// bubble is hidden at 0 and the spoken text inside the live region is rewritten, so assistive
// technology announces the new count.
export interface CartChangedDetail {
  readonly count: number
}

const render = (badge: HTMLElement, count: number) => {
  const max = Number(badge.dataset.max) || 99
  const bubble = badge.querySelector<HTMLElement>('[data-count-bubble]')
  const spoken = badge.querySelector<HTMLElement>('[data-count-spoken]')
  if (bubble) {
    bubble.hidden = count <= 0
    bubble.textContent = count > max ? `${max}+` : String(count)
  }
  if (spoken) spoken.textContent = (badge.dataset.labelTemplate ?? '{count}').replace('{count}', String(count))
}

export const mountCountBadges = () => {
  document.addEventListener('cart:changed', (event) => {
    const count = (event as CustomEvent<CartChangedDetail>).detail?.count
    if (typeof count !== 'number' || !Number.isFinite(count)) return
    for (const badge of document.querySelectorAll<HTMLElement>('[data-count-badge]')) render(badge, Math.max(0, Math.trunc(count)))
  })
}

const flag = '__countBadgeMounted'
const scope = window as unknown as Record<string, boolean>
if (!scope[flag]) {
  scope[flag] = true
  mountCountBadges()
}
