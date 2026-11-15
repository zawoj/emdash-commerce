import { DEV_TOOLS, EMDASH, TOOL, type ToolId } from './constants'
import { setupCollapse } from './collapse'
import { ICONS, TITLES } from './icons'
import { STYLES } from './styles'

export interface ToolButton {
  id: ToolId
  element: HTMLButtonElement
  setPressed: (isPressed: boolean) => void
  /** `isAlert` colours the badge red (errors); notes use a neutral blue one. */
  setBadge: (count: number, isAlert?: boolean) => void
}

const createButton = (id: ToolId, onClick: (id: ToolId) => void): ToolButton => {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = 'emdash-tb-devtool'
  element.dataset.tool = id
  element.title = TITLES[id]
  element.setAttribute('aria-label', TITLES[id])
  element.setAttribute('aria-pressed', 'false')
  element.innerHTML = `${ICONS[id]}<span class="emdash-tb-devtool-badge" hidden></span>`
  element.addEventListener('click', () => onClick(id))
  const badge = element.querySelector<HTMLElement>('.emdash-tb-devtool-badge')!
  return {
    id,
    element,
    setPressed: (isPressed) => element.setAttribute('aria-pressed', String(isPressed)),
    setBadge: (count, isAlert = true) => {
      badge.dataset.tone = isAlert ? 'alert' : 'info'
      badge.hidden = count === 0
      badge.textContent = count > 99 ? '99+' : String(count)
    },
  }
}

const injectStyles = (): void => {
  if (document.getElementById(DEV_TOOLS.STYLE_ID)) return
  const style = document.createElement('style')
  style.id = DEV_TOOLS.STYLE_ID
  style.textContent = STYLES
  document.head.append(style)
}

/** Put the buttons into the EmDash pill, before its close button. Returns null while the pill is not on the page. */
export const mountButtons = (onClick: (id: ToolId) => void): Record<ToolId, ToolButton> | null => {
  const inner = document.querySelector(EMDASH.TOOLBAR_INNER)
  if (!inner || inner.querySelector(`#${DEV_TOOLS.ROOT_ID}`)) return null
  injectStyles()
  const group = document.createElement('span')
  group.id = DEV_TOOLS.ROOT_ID
  const divider = document.createElement('div')
  divider.className = 'emdash-tb-divider'
  const buttons = Object.fromEntries(Object.values(TOOL).map((id) => [id, createButton(id, onClick)])) as Record<ToolId, ToolButton>
  group.append(divider, ...Object.values(buttons).map((b) => b.element))
  inner.insertBefore(group, document.getElementById(EMDASH.DISMISS_ID))
  const toolbar = document.getElementById(EMDASH.TOOLBAR_ID)
  if (toolbar) setupCollapse(toolbar)
  return buttons
}
