// Behaviour of the phone menu drawer: open from the menu button, drill into a top item's level (and a long
// column's level inside it) and back,
// close with the button, Escape or a click on the backdrop. Levels are stacked in one viewport; the
// active one is `data-state="active"`, the ones already passed `left`, the rest `right` — all but the
// active level are `inert`. Focus follows the drill (the Back button in, the row that was tapped on the
// way back) and returns to the menu button on close. The drawer closes when the viewport grows to the
// desktop menu.
const STATE = { active: 'active', left: 'left', right: 'right' } as const

const desktopQuery = '(min-width: 1101px)'

const initDrawer = (dialog: HTMLDialogElement): void => {
  const levels = [...dialog.querySelectorAll<HTMLElement>('[data-drawer-level]')]
  const root = levels.find((level) => level.dataset.drawerLevel === 'root')
  const back = dialog.querySelector<HTMLButtonElement>('[data-drawer-back]')
  // The header's menu button and the phone tab bar's "categories" tab both open the drawer.
  const openers = [...document.querySelectorAll<HTMLElement>(`[data-site-drawer-open][aria-controls="${dialog.id}"]`)]
  let opener: HTMLElement | undefined = openers[0]
  const viewport = dialog.querySelector<HTMLElement>('.site-drawer__viewport')
  if (!root || !back || !viewport) return
  // A specimen is rendered already drilled in: start from the level that is active.
  const initial = levels.find((level) => level.dataset.state === STATE.active)
  let path: string[] = initial && initial !== root && initial.dataset.drawerLevel ? [initial.dataset.drawerLevel] : []
  // The row that opened each level, to give focus back on the way out.
  const triggers = new Map<string, HTMLElement>()

  const levelById = (id: string): HTMLElement | undefined => levels.find((level) => level.dataset.drawerLevel === id)

  const render = () => {
    const activeId = path[path.length - 1] ?? 'root'
    for (const level of levels) {
      const id = level.dataset.drawerLevel ?? ''
      const state = id === activeId ? STATE.active : id === 'root' || path.includes(id) ? STATE.left : STATE.right
      level.dataset.state = state
      level.inert = state !== STATE.active
    }
    back.hidden = path.length === 0
  }

  const goTo = (id: string, trigger: HTMLElement) => {
    const level = levelById(id)
    if (!level) return
    triggers.set(id, trigger)
    path = [...path, id]
    render()
    level.scrollTop = 0
    back.focus()
  }

  const goBack = () => {
    const left = path[path.length - 1]
    path = path.slice(0, -1)
    render()
    const trigger = left ? triggers.get(left) : undefined
    trigger?.focus()
  }

  viewport.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-drawer-go]') : null
    if (target?.dataset.drawerGo) goTo(target.dataset.drawerGo, target)
  })
  back.addEventListener('click', goBack)
  dialog.querySelector('[data-drawer-close]')?.addEventListener('click', () => dialog.close())
  for (const button of openers) {
    button.addEventListener('click', () => {
      opener = button
      path = []
      render()
      dialog.showModal()
      dialog.querySelector<HTMLElement>('[data-drawer-close]')?.focus()
    })
  }
  // A click whose target is the dialog itself landed on the backdrop, beside the sheet.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close()
  })
  dialog.addEventListener('close', () => {
    path = []
    render()
    opener?.focus()
  })
  window.matchMedia(desktopQuery).addEventListener('change', (event) => {
    if (event.matches && dialog.open) dialog.close()
  })
}

export const initMobileDrawers = (): void => {
  for (const dialog of document.querySelectorAll<HTMLDialogElement>('[data-site-drawer]')) initDrawer(dialog)
}
