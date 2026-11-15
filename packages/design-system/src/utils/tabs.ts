// Behaviour of the tabs component (WAI-ARIA tabs pattern): the bar and the panels start in their
// no-script state (bar hidden, every panel visible with its own heading); this script shows the bar,
// shows one panel at a time, moves selection with the arrow keys / Home / End (roving tabindex,
// activation on arrow), and opens the tab a URL hash names. A panel that becomes visible fires
// `tabs:shown` on itself so content that measures its height (a clamped text) can re-measure.
import { nextTabIndex, tabFromHash } from './tabs-core'

export const TABS_SHOWN_EVENT = 'tabs:shown'

const mountTabs = (root: HTMLElement): void => {
  if (root.dataset.tabsReady === 'true') return
  const tabs = [...root.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
  const panels = tabs.map((tab) => document.getElementById(tab.getAttribute('aria-controls') ?? ''))
  if (tabs.length < 2 || panels.some((panel) => panel === null)) return
  root.dataset.tabsReady = 'true'
  root.querySelector<HTMLElement>('[role="tablist"]')?.removeAttribute('hidden')

  const select = (index: number, isFocused: boolean): void => {
    tabs.forEach((tab, position) => {
      const isActive = position === index
      tab.setAttribute('aria-selected', String(isActive))
      tab.tabIndex = isActive ? 0 : -1
      const panel = panels[position]
      if (!panel) return
      const wasHidden = panel.hidden
      panel.hidden = !isActive
      if (isActive && wasHidden) panel.dispatchEvent(new CustomEvent(TABS_SHOWN_EVENT))
    })
    if (isFocused) tabs[index]?.focus()
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(index, false))
    tab.addEventListener('keydown', (event) => {
      const target = nextTabIndex(event.key, index, tabs.length)
      if (target === null) return
      event.preventDefault()
      select(target, true)
    })
  })

  const ids = tabs.map((tab) => tab.dataset.tabId ?? '')
  const fromHash = (): void => {
    const id = tabFromHash(window.location.hash, ids)
    if (id !== null) select(ids.indexOf(id), false)
  }
  window.addEventListener('hashchange', fromHash)
  select(0, false)
  fromHash()
}

export const mountAllTabs = (): void => {
  for (const root of document.querySelectorAll<HTMLElement>('[data-tabs]')) mountTabs(root)
}
