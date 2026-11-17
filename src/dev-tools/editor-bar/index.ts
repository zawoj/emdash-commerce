import { runAudit } from './audit'
import { copyText } from './clipboard'
import { restoreLegacyDismissal } from './collapse'
import { closeComposer, isComposerOpen, openComposer } from './composer'
import { COMMENT_STATE, DEV_TOOLS, EMDASH, PANEL_TOOLS, TOOL, type ToolId } from './constants'
import { installErrorCapture, scanBrokenResources } from './error-capture'
import { createErrorStore } from './error-store'
import { createFeedbackApi } from './feedback-api'
import { createFeedbackStore } from './feedback-store'
import { hideOverlay } from './highlight'
import { startInspect } from './inspect'
import { mountButtons, type ToolButton } from './mount'
import { fetchSchema } from './schema'
import { PANEL_CLOSED_EVENT, auditView, errorsView, hidePanel, loadingView, notesView, renderPanel } from './panel'
import { showPins } from './pins'
import { collectionsOnPage } from './ref'
import { buildPrompt } from './prompt'
import { showToast } from './toast'
import { setXray } from './xray'
import type { Annotation } from './types'

/**
 * Dev-only add-on for the EmDash visual editing pill: X-ray, Inspect, Notes, Audit and Errors.
 * Everything below `import.meta.env.DEV` is dead code in a production build.
 */
const start = (): void => {
  restoreLegacyDismissal()
  const errors = createErrorStore()
  installErrorCapture(errors)
  const notes = createFeedbackStore(createFeedbackApi(), location.pathname)

  let buttons: Record<ToolId, ToolButton> | null = null
  let panelTool: ToolId | null = null
  let stopInspect: (() => void) | null = null
  let stopPolling: (() => void) | null = null

  const readXray = (): boolean => {
    try {
      return localStorage.getItem(`${DEV_TOOLS.STORAGE_KEY}:xray`) === '1'
    } catch {
      return false
    }
  }
  const saveXray = (isOn: boolean): void => {
    try {
      localStorage.setItem(`${DEV_TOOLS.STORAGE_KEY}:xray`, isOn ? '1' : '0')
    } catch {
      // storage can be blocked; the toggle just does not persist
    }
  }

  // The prompt carries the live schema, so an agent can tell an existing field (content only) from a missing one.
  const promptFor = async (annotations: readonly Annotation[]): Promise<string> =>
    buildPrompt(annotations, {
      url: location.href,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      pageCollections: collectionsOnPage(),
      schema: await fetchSchema(),
    })

  const showAudit = async (): Promise<void> => {
    renderPanel(loadingView('Audit'))
    const issues = await runAudit()
    if (panelTool === TOOL.AUDIT) renderPanel(auditView(issues, () => void showAudit()))
  }
  const showErrors = (): void => renderPanel(errorsView(errors.list(), errors.clear))
  const showNotes = (): void =>
    renderPanel(
      notesView(
        { open: notes.open(), finished: notes.finished(), error: notes.error()?.message ?? null },
        {
          onCopyAll: () => void copyText(promptFor([...notes.open()])),
          onClearDone: () => void notes.clearDone(),
          onRemove: (id) => void notes.remove(id),
          onRetry: () => void notes.refresh(),
        },
      ),
    )

  const setPanelTool = (id: ToolId | null): void => {
    panelTool = id
    for (const tool of PANEL_TOOLS) buttons?.[tool].setPressed(tool === id)
    if (id === null) hidePanel()
    else if (id === TOOL.AUDIT) void showAudit()
    else if (id === TOOL.NOTES) {
      showNotes()
      void notes.refresh()
    }
    else showErrors()
  }

  const dismissComposer = (): void => {
    closeComposer()
    hideOverlay()
  }

  const pick = (element: Element): void =>
    openComposer(element, {
      onAdd: async (comment, info) => void (await notes.add(comment, info, location.href)),
      // The prompt needs the Comment ID, so the comment is saved first; the clipboard gets the prompt as a promise.
      onCopy: async (comment, info) => copyText(notes.add(comment, info, location.href).then((created) => promptFor([created]))),
      onClose: dismissComposer,
    })

  const toggleInspect = (): void => {
    const isOn = stopInspect === null
    if (isOn) stopInspect = startInspect(pick)
    else {
      stopInspect?.()
      stopInspect = null
      dismissComposer()
    }
    buttons?.[TOOL.INSPECT].setPressed(isOn)
  }

  const toggleXray = (): void => {
    const isOn = !document.documentElement.classList.contains(DEV_TOOLS.XRAY_CLASS)
    setXray(isOn)
    saveXray(isOn)
    buttons?.[TOOL.XRAY].setPressed(isOn)
  }

  const onClick = (id: ToolId): void => {
    if (id === TOOL.XRAY) toggleXray()
    else if (id === TOOL.INSPECT) toggleInspect()
    else setPanelTool(panelTool === id ? null : id)
  }

  errors.subscribe(() => {
    buttons?.[TOOL.ERRORS].setBadge(errors.failureCount())
    if (panelTool === TOOL.ERRORS) showErrors()
  })
  notes.subscribe(() => {
    buttons?.[TOOL.NOTES].setBadge(notes.open().length, false)
    showPins(notes.open())
    if (panelTool === TOOL.NOTES) showNotes()
  })
  notes.onResolved((comment) => {
    const verdict = comment.state === COMMENT_STATE.DONE ? 'Done' : 'Won’t fix'
    showToast(`${verdict}: ${comment.comment.slice(0, 60)}${comment.resolution ? ` — ${comment.resolution}` : ''}`)
  })

  document.addEventListener(PANEL_CLOSED_EVENT, () => {
    panelTool = null
    for (const tool of PANEL_TOOLS) buttons?.[tool].setPressed(false)
  })
  document.addEventListener(DEV_TOOLS.COLLAPSED_EVENT, () => {
    if (stopInspect) toggleInspect()
    dismissComposer()
    if (panelTool) setPanelTool(null)
  })
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return
    if (isComposerOpen()) dismissComposer()
    else if (stopInspect) toggleInspect()
    else if (panelTool) setPanelTool(null)
  })

  const mount = (): void => {
    const mounted = mountButtons(onClick)
    if (!mounted) return
    buttons = mounted
    scanBrokenResources(errors)
    buttons[TOOL.ERRORS].setBadge(errors.failureCount())
    buttons[TOOL.NOTES].setBadge(notes.open().length, false)
    showPins(notes.open())
    if (readXray()) toggleXray()
    stopPolling ??= notes.startPolling()
  }

  // The pill is injected into the response by EmDash's middleware, only for a signed-in editor,
  // and its markup can be re-rendered — keep the buttons attached while the page lives.
  mount()
  new MutationObserver(() => {
    if (document.querySelector(EMDASH.TOOLBAR_INNER) && !document.getElementById(DEV_TOOLS.ROOT_ID)) mount()
  }).observe(document.body, { childList: true, subtree: true })
}

if (import.meta.env.DEV) start()
