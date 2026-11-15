import { ERROR_KIND } from './constants'
import type { ErrorStore } from './error-store'
import { cssPath, isIgnored } from './selector'

const stringify = (value: unknown): string => {
  if (value instanceof Error) return value.message
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

const HTTP_ERROR_FROM = 400

const captureConsole = (store: ErrorStore): void => {
  for (const [method, kind] of [
    ['error', ERROR_KIND.CONSOLE_ERROR],
    ['warn', ERROR_KIND.CONSOLE_WARN],
  ] as const) {
    const original = console[method].bind(console)
    console[method] = (...args: unknown[]): void => {
      original(...args)
      store.add({ kind, message: args.map(stringify).join(' ').slice(0, 400) })
    }
  }
}

const captureWindowErrors = (store: ErrorStore): void => {
  window.addEventListener('error', (event) => {
    const target = event.target
    if (target instanceof Element && target !== (window as unknown as Element)) {
      if (isIgnored(target)) return
      const url = target.getAttribute('src') ?? target.getAttribute('href') ?? ''
      store.add({ kind: ERROR_KIND.RESOURCE, message: `Failed to load <${target.tagName.toLowerCase()}>`, source: url, selector: cssPath(target) })
      return
    }
    store.add({ kind: ERROR_KIND.SCRIPT, message: event.message, source: event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : undefined })
  }, true)
  window.addEventListener('unhandledrejection', (event) => {
    store.add({ kind: ERROR_KIND.PROMISE, message: stringify(event.reason) })
  })
}

const captureFetch = (store: ErrorStore): void => {
  const original = window.fetch.bind(window)
  window.fetch = async (...args: Parameters<typeof fetch>): Promise<Response> => {
    const url = args[0] instanceof Request ? args[0].url : String(args[0])
    try {
      const response = await original(...args)
      if (response.status >= HTTP_ERROR_FROM) store.add({ kind: ERROR_KIND.REQUEST, message: `${response.status} ${response.statusText}`.trim(), source: url })
      return response
    } catch (error) {
      store.add({ kind: ERROR_KIND.REQUEST, message: `Request failed: ${stringify(error)}`, source: url })
      throw error
    }
  }
}

/** Images and resources that failed before this script ran never fired an event we could hear. */
export const scanBrokenResources = (store: ErrorStore): void => {
  for (const img of document.images) {
    if (isIgnored(img) || !img.complete || img.naturalWidth > 0 || !img.currentSrc) continue
    store.add({ kind: ERROR_KIND.RESOURCE, message: 'Failed to load <img>', source: img.currentSrc, selector: cssPath(img) })
  }
  for (const entry of performance.getEntriesByType('resource') as PerformanceResourceTiming[]) {
    if (entry.responseStatus >= HTTP_ERROR_FROM) store.add({ kind: ERROR_KIND.REQUEST, message: `${entry.responseStatus} ${entry.initiatorType}`, source: entry.name })
  }
}

export const installErrorCapture = (store: ErrorStore): void => {
  captureConsole(store)
  captureWindowErrors(store)
  captureFetch(store)
}
