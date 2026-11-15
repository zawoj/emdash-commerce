import { COMMENT_STATE, FEEDBACK } from './constants'
import { FEEDBACK_PROBLEM, FeedbackError, type FeedbackApi } from './feedback-api'
import type { Annotation, ElementInfo } from './types'

type Listener = () => void
type ResolvedListener = (comment: Annotation) => void

const isOpen = (comment: Annotation): boolean => comment.state === COMMENT_STATE.OPEN

/**
 * The comments of one page, kept in sync with the `feedback` collection: an agent that marks a comment
 * done (MCP or CLI) shows up here on the next refresh, and a poll keeps that fresh while the tab is visible.
 */
export const createFeedbackStore = (api: FeedbackApi, pagePath: string) => {
  let items: Annotation[] = []
  let error: FeedbackError | null = null
  const listeners = new Set<Listener>()
  const resolvedListeners = new Set<ResolvedListener>()

  const emit = (): void => listeners.forEach((listener) => listener())

  const fail = (caught: unknown): void => {
    error = caught instanceof FeedbackError ? caught : new FeedbackError(FEEDBACK_PROBLEM.OTHER, String(caught))
    emit()
  }

  const refresh = async (): Promise<void> => {
    try {
      const all = await api.list()
      const mine = all.filter((comment) => comment.pagePath === pagePath)
      const wasOpen = new Set(items.filter(isOpen).map((comment) => comment.id))
      const resolved = mine.filter((comment) => !isOpen(comment) && wasOpen.has(comment.id))
      items = mine
      error = null
      emit()
      resolved.forEach((comment) => resolvedListeners.forEach((listener) => listener(comment)))
    } catch (caught) {
      fail(caught)
    }
  }

  const add = async (comment: string, element: ElementInfo, pageUrl: string): Promise<Annotation> => {
    const created = await api.create({ comment: comment.trim(), element, pagePath, pageUrl })
    items = [...items, created]
    error = null
    emit()
    return created
  }

  const remove = async (id: string): Promise<void> => {
    await api.remove(id)
    items = items.filter((comment) => comment.id !== id)
    emit()
  }

  const clearDone = async (): Promise<void> => {
    const finished = items.filter((comment) => !isOpen(comment))
    await Promise.all(finished.map((comment) => api.remove(comment.id)))
    items = items.filter(isOpen)
    emit()
  }

  /** Refresh now and then every `ms` while the tab is visible. A missing collection or a refused session stops it. */
  const startPolling = (ms: number = FEEDBACK.POLL_MS, isVisible: () => boolean = () => document.visibilityState === 'visible'): (() => void) => {
    void refresh()
    const timer = setInterval(() => {
      const isStopped = error?.problem === FEEDBACK_PROBLEM.MISSING || error?.problem === FEEDBACK_PROBLEM.FORBIDDEN
      if (isVisible() && !isStopped) void refresh()
    }, ms)
    return () => clearInterval(timer)
  }

  return {
    refresh,
    add,
    remove,
    clearDone,
    startPolling,
    open: (): readonly Annotation[] => items.filter(isOpen),
    finished: (): readonly Annotation[] => items.filter((comment) => !isOpen(comment)),
    error: (): FeedbackError | null => error,
    subscribe: (listener: Listener): (() => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    onResolved: (listener: ResolvedListener): (() => void) => {
      resolvedListeners.add(listener)
      return () => resolvedListeners.delete(listener)
    },
  }
}

export type FeedbackStore = ReturnType<typeof createFeedbackStore>
