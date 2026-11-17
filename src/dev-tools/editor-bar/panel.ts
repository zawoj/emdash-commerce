import { COMMENT_STATE, DEV_TOOLS, ERROR_KIND, SEVERITY } from './constants'
import { highlightSelector } from './highlight'
import { refLabel } from './ref'
import type { Annotation, AuditIssue, CapturedError } from './types'

export const PANEL_CLOSED_EVENT = 'emdash-dev-tools:panel-closed'

const escapeHtml = (value: string): string => value.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)

export interface PanelAction {
  id: string
  label: string
  run: () => void
}

export interface PanelView {
  title: string
  rows: string
  isEmpty: boolean
  emptyText: string
  actions?: PanelAction[]
  /** Called for a button inside a row (`data-row-action` / `data-id`). */
  onRowAction?: (action: string, id: string) => void
}

let currentView: PanelView | null = null

const panelElement = (): HTMLElement => {
  const existing = document.getElementById(DEV_TOOLS.PANEL_ID)
  if (existing) return existing
  const node = document.createElement('div')
  node.id = DEV_TOOLS.PANEL_ID
  node.hidden = true
  node.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null
    const rowAction = target?.closest<HTMLElement>('[data-row-action]')
    if (rowAction?.dataset.rowAction) {
      currentView?.onRowAction?.(rowAction.dataset.rowAction, rowAction.dataset.id ?? '')
      return
    }
    const action = target?.closest<HTMLElement>('[data-act]')
    if (action?.dataset.act === 'close') {
      hidePanel()
      return
    }
    if (action?.dataset.act) {
      currentView?.actions?.find((a) => a.id === action.dataset.act)?.run()
      return
    }
    const row = target?.closest<HTMLElement>('li[data-selector]')
    if (row?.dataset.selector) highlightSelector(row.dataset.selector)
  })
  document.body.append(node)
  return node
}

const row = (severity: string, tag: string, message: string, meta: string, selector?: string, extra = ''): string =>
  `<li${selector ? ` data-selector="${escapeHtml(selector)}"` : ''}><span class="dt-dot" data-severity="${severity}"></span>` +
  `<div class="dt-body"><div class="dt-msg">${escapeHtml(message)}</div>${meta ? `<div class="dt-meta">${meta}</div>` : ''}</div><span class="dt-tag">${escapeHtml(tag)}</span>${extra}</li>`

export const auditView = (issues: readonly AuditIssue[], onRefresh: () => void): PanelView => ({
  title: `Audit — ${issues.length} issue${issues.length === 1 ? '' : 's'}`,
  isEmpty: issues.length === 0,
  emptyText: 'No issues found by the accessibility, SEO and performance checks.',
  actions: [{ id: 'refresh', label: 'Re-run', run: onRefresh }],
  rows: issues
    .map((i) => {
      const meta = [i.selector ? escapeHtml(i.selector) : '', i.helpUrl ? `<a href="${escapeHtml(i.helpUrl)}" target="_blank" rel="noopener">docs</a>` : ''].filter(Boolean).join(' · ')
      return row(i.severity, i.category, i.message, meta, i.selector)
    })
    .join(''),
})

export const errorsView = (errors: readonly CapturedError[], onClear: () => void): PanelView => ({
  title: `Errors — ${errors.length} distinct`,
  isEmpty: errors.length === 0,
  emptyText: 'Nothing has gone wrong on this page since it loaded.',
  actions: [{ id: 'clear', label: 'Clear', run: onClear }],
  rows: errors
    .map((e) => {
      const severity = e.kind === ERROR_KIND.CONSOLE_WARN ? SEVERITY.WARNING : SEVERITY.ERROR
      const message = e.count > 1 ? `${e.message}  ×${e.count}` : e.message
      return row(severity, e.kind, message, e.source ? escapeHtml(e.source) : '', e.selector)
    })
    .join(''),
})

export interface NotesHandlers {
  onCopyAll: () => void
  onClearDone: () => void
  onRemove: (id: string) => void
  onRetry: () => void
}

export interface NotesState {
  open: readonly Annotation[]
  finished: readonly Annotation[]
  /** Why comments cannot be loaded or saved, when they cannot. */
  error: string | null
}

const stateRow = (note: Annotation, remove: string): string => {
  const isDone = note.state === COMMENT_STATE.DONE
  const verdict = isDone ? '✓ done' : '✗ won’t fix'
  const detail = note.resolution ? `${verdict} — ${escapeHtml(note.resolution)}` : verdict
  return row(note.state, note.state, note.comment, `${detail}<br>ID ${escapeHtml(note.id)}`, undefined, remove)
}

export const notesView = ({ open, finished, error }: NotesState, handlers: NotesHandlers): PanelView => {
  const count = `${open.length} open${finished.length ? `, ${finished.length} done` : ''}`
  const removeButton = (id: string): string => `<button class="dt-x" data-row-action="remove" data-id="${escapeHtml(id)}" title="Delete this comment" aria-label="Delete this comment">×</button>`
  const openRows = open
    .map((n, index) => {
      const where = n.element.ref ? refLabel(n.element.ref) : n.element.selector
      return row(SEVERITY.INFO, `#${index + 1}`, n.comment, `${escapeHtml(where)}<br>ID ${escapeHtml(n.id)}`, n.element.selector, removeButton(n.id))
    })
    .join('')
  const finishedRows = finished.length ? `<li class="dt-section">Done — the agent has applied or declined these</li>${finished.map((n) => stateRow(n, removeButton(n.id))).join('')}` : ''
  const actions: PanelAction[] = [
    ...(error ? [{ id: 'retry', label: 'Retry', run: handlers.onRetry }] : []),
    ...(open.length ? [{ id: 'copy', label: 'Copy prompt', run: handlers.onCopyAll }] : []),
    ...(finished.length ? [{ id: 'clear-done', label: 'Clear done', run: handlers.onClearDone }] : []),
  ]
  return {
    title: `Notes — ${count} on this page`,
    isEmpty: open.length === 0 && finished.length === 0,
    emptyText: error ?? 'Turn on Inspect, click an element and write what should change. Your comments collect here; when an agent applies one it moves to Done.',
    actions,
    onRowAction: (action, id) => {
      if (action === 'remove') handlers.onRemove(id)
    },
    rows: `${error ? `<li class="dt-problem">${escapeHtml(error)}</li>` : ''}${openRows}${finishedRows}`,
  }
}

export const renderPanel = (view: PanelView): void => {
  currentView = view
  const panel = panelElement()
  panel.hidden = false
  const buttons = (view.actions ?? []).map((a) => `<button data-act="${escapeHtml(a.id)}">${escapeHtml(a.label)}</button>`).join('')
  panel.innerHTML = `<header><h2>${escapeHtml(view.title)}</h2>${buttons}<button data-act="close">Close</button></header>` +
    (view.isEmpty ? `<div class="dt-empty">${escapeHtml(view.emptyText)}</div>` : `<ul>${view.rows}</ul>`)
}

export const hidePanel = (): void => {
  const panel = document.getElementById(DEV_TOOLS.PANEL_ID)
  if (panel) panel.hidden = true
  currentView = null
  document.dispatchEvent(new CustomEvent(PANEL_CLOSED_EVENT))
}

export const loadingView = (title: string): PanelView => ({ title, rows: '', isEmpty: true, emptyText: 'Running…' })
