import { describe, expect, it, vi } from 'vitest'
import { ERROR_KIND } from './constants'
import { createErrorStore } from './error-store'

describe('createErrorStore', () => {
  it('collapses identical problems into one row with a counter', () => {
    const store = createErrorStore()
    store.add({ kind: ERROR_KIND.SCRIPT, message: 'boom', source: 'a.js:1:1' })
    store.add({ kind: ERROR_KIND.SCRIPT, message: 'boom', source: 'a.js:1:1' })
    store.add({ kind: ERROR_KIND.SCRIPT, message: 'boom', source: 'b.js:1:1' })
    expect(store.list()).toHaveLength(2)
    expect(store.list().find((e) => e.source === 'a.js:1:1')?.count).toBe(2)
  })

  it('does not count console warnings as failures', () => {
    const store = createErrorStore()
    store.add({ kind: ERROR_KIND.CONSOLE_WARN, message: 'deprecated' })
    store.add({ kind: ERROR_KIND.REQUEST, message: '500', source: '/api' })
    store.add({ kind: ERROR_KIND.REQUEST, message: '500', source: '/api' })
    expect(store.failureCount()).toBe(2)
  })

  it('keeps the newest entries when over the limit', () => {
    const store = createErrorStore(2)
    for (const message of ['a', 'b', 'c']) store.add({ kind: ERROR_KIND.PROMISE, message })
    expect(store.list().map((e) => e.message)).toEqual(['c', 'b'])
  })

  it('notifies subscribers and stops after unsubscribe', () => {
    const store = createErrorStore()
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    store.add({ kind: ERROR_KIND.SCRIPT, message: 'x' })
    unsubscribe()
    store.clear()
    expect(listener).toHaveBeenCalledTimes(1)
    expect(store.list()).toEqual([])
  })
})
