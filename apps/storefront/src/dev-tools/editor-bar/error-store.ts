import { ERROR_KIND, LIMITS, type ErrorKind } from './constants'
import type { CapturedError } from './types'

type Listener = (errors: readonly CapturedError[]) => void

export interface ErrorInput {
  kind: ErrorKind
  message: string
  source?: string
  selector?: string
}

/** In-memory list of page problems. Identical ones collapse into one row with a counter. */
export const createErrorStore = (max: number = LIMITS.MAX_ERRORS) => {
  const entries: CapturedError[] = []
  const listeners = new Set<Listener>()
  let nextId = 1

  const emit = (): void => listeners.forEach((listener) => listener(entries))

  const add = (input: ErrorInput): void => {
    const existing = entries.find((e) => e.kind === input.kind && e.message === input.message && e.source === input.source)
    if (existing) {
      existing.count += 1
      existing.at = Date.now()
    } else {
      entries.unshift({ ...input, id: nextId++, count: 1, at: Date.now() })
      if (entries.length > max) entries.pop()
    }
    emit()
  }

  const clear = (): void => {
    entries.length = 0
    emit()
  }

  const subscribe = (listener: Listener): (() => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  /** Number of problems that are real failures, not console warnings. */
  const failureCount = (): number => entries.filter((e) => e.kind !== ERROR_KIND.CONSOLE_WARN).reduce((sum, e) => sum + e.count, 0)

  return { add, clear, subscribe, failureCount, list: (): readonly CapturedError[] => entries }
}

export type ErrorStore = ReturnType<typeof createErrorStore>
