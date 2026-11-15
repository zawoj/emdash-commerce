import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FEEDBACK_PROBLEM, FeedbackError, type FeedbackApi } from './feedback-api'
import { createFeedbackStore } from './feedback-store'
import type { Annotation, ElementInfo } from './types'

const ELEMENT: ElementInfo = { tag: 'p', classNames: [], selector: 'p', text: '', width: 1, height: 1, ref: null, island: null, source: null }

const comment = (id: string, overrides: Partial<Annotation> = {}): Annotation => ({ id, comment: `c-${id}`, element: ELEMENT, state: 'open', resolution: '', pagePath: '/', pageUrl: 'http://localhost:4360/', createdAt: 0, ...overrides })

const fakeApi = (initial: Annotation[] = []) => {
  const rows = [...initial]
  const api = {
    list: vi.fn(async () => rows.map((r) => ({ ...r }))),
    create: vi.fn(async (input: { comment: string; pagePath: string; pageUrl: string }) => {
      const created = comment(`new${rows.length + 1}`, { comment: input.comment, pagePath: input.pagePath, pageUrl: input.pageUrl })
      rows.push(created)
      return created
    }),
    remove: vi.fn(async (id: string) => void rows.splice(rows.findIndex((r) => r.id === id), 1)),
  }
  return { api: api as unknown as FeedbackApi & typeof api, rows }
}

describe('createFeedbackStore', () => {
  it('only shows the comments of its own page, split into open and finished', async () => {
    const { api } = fakeApi([comment('a'), comment('b', { state: 'done', resolution: 'Did it' }), comment('c', { pagePath: '/other' }), comment('d', { state: 'wontfix' })])
    const store = createFeedbackStore(api, '/')
    await store.refresh()
    expect(store.open().map((c) => c.id)).toEqual(['a'])
    expect(store.finished().map((c) => c.id)).toEqual(['b', 'd'])
  })

  it('adds a comment for this page and trims it', async () => {
    const { api } = fakeApi()
    const store = createFeedbackStore(api, '/posts/x')
    const created = await store.add('  hello  ', ELEMENT, 'http://localhost:4360/posts/x')
    expect(api.create).toHaveBeenCalledWith({ comment: 'hello', element: ELEMENT, pagePath: '/posts/x', pageUrl: 'http://localhost:4360/posts/x' })
    expect(store.open().map((c) => c.id)).toEqual([created.id])
  })

  it('tells listeners when a comment it knew as open has been marked done elsewhere', async () => {
    const { api, rows } = fakeApi([comment('a'), comment('b')])
    const store = createFeedbackStore(api, '/')
    await store.refresh()
    const resolved = vi.fn()
    store.onResolved(resolved)
    rows[0] = comment('a', { state: 'done', resolution: 'Changed the title' })
    await store.refresh()
    expect(resolved).toHaveBeenCalledTimes(1)
    expect(resolved).toHaveBeenCalledWith(expect.objectContaining({ id: 'a', state: 'done', resolution: 'Changed the title' }))
    expect(store.open().map((c) => c.id)).toEqual(['b'])
  })

  it('does not announce a comment that was already finished when the page loaded', async () => {
    const { api } = fakeApi([comment('a', { state: 'done' })])
    const store = createFeedbackStore(api, '/')
    const resolved = vi.fn()
    store.onResolved(resolved)
    await store.refresh()
    await store.refresh()
    expect(resolved).not.toHaveBeenCalled()
  })

  it('deletes one comment, or all the finished ones', async () => {
    const { api } = fakeApi([comment('a'), comment('b', { state: 'done' }), comment('c', { state: 'wontfix' })])
    const store = createFeedbackStore(api, '/')
    await store.refresh()
    await store.clearDone()
    expect(api.remove.mock.calls.map((c) => c[0]).sort()).toEqual(['b', 'c'])
    expect(store.finished()).toEqual([])
    await store.remove('a')
    expect(store.open()).toEqual([])
  })

  it('keeps the problem so the panel can show it, and clears it once loading works', async () => {
    const { api } = fakeApi()
    api.list.mockRejectedValueOnce(new FeedbackError(FEEDBACK_PROBLEM.MISSING, 'no collection'))
    const store = createFeedbackStore(api, '/')
    await store.refresh()
    expect(store.error()?.message).toBe('no collection')
    await store.refresh()
    expect(store.error()).toBeNull()
  })

  it('notifies subscribers on every change', async () => {
    const { api } = fakeApi()
    const store = createFeedbackStore(api, '/')
    const listener = vi.fn()
    store.subscribe(listener)
    await store.add('x', ELEMENT, 'u')
    await store.refresh()
    expect(listener).toHaveBeenCalledTimes(2)
  })
})

describe('polling', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('refreshes now and then on every tick while the tab is visible, until stopped', async () => {
    const { api } = fakeApi()
    const store = createFeedbackStore(api, '/')
    const stop = store.startPolling(1000, () => true)
    await vi.advanceTimersByTimeAsync(0)
    expect(api.list).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(2000)
    expect(api.list).toHaveBeenCalledTimes(3)
    stop()
    await vi.advanceTimersByTimeAsync(5000)
    expect(api.list).toHaveBeenCalledTimes(3)
  })

  it('skips ticks while the tab is hidden', async () => {
    const { api } = fakeApi()
    const store = createFeedbackStore(api, '/')
    store.startPolling(1000, () => false)
    await vi.advanceTimersByTimeAsync(3000)
    expect(api.list).toHaveBeenCalledTimes(1)
  })

  it('stops asking once the collection is missing or the session is refused', async () => {
    const { api } = fakeApi()
    api.list.mockRejectedValue(new FeedbackError(FEEDBACK_PROBLEM.MISSING, 'no collection'))
    const store = createFeedbackStore(api, '/')
    store.startPolling(1000, () => true)
    await vi.advanceTimersByTimeAsync(5000)
    expect(api.list).toHaveBeenCalledTimes(1)
  })

  it('keeps asking after a passing failure', async () => {
    const { api } = fakeApi()
    api.list.mockRejectedValue(new FeedbackError(FEEDBACK_PROBLEM.OTHER, 'blip'))
    const store = createFeedbackStore(api, '/')
    store.startPolling(1000, () => true)
    await vi.advanceTimersByTimeAsync(3000)
    expect(api.list.mock.calls.length).toBeGreaterThan(2)
  })
})
