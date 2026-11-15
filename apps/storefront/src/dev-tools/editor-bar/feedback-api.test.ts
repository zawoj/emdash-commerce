import { describe, expect, it, vi } from 'vitest'
import { FEEDBACK_PROBLEM, FeedbackError, createFeedbackApi, toAnnotation } from './feedback-api'
import type { ElementInfo } from './types'

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const ELEMENT: ElementInfo = { tag: 'h1', classNames: ['t'], selector: 'main > h1', text: 'Hi', width: 1, height: 1, ref: null, island: null, source: null }

const entry = (id: string, data: Record<string, unknown> = {}) => ({
  id,
  createdAt: '2026-11-12 11:13:46',
  data: { comment: 'c', state: 'open', resolution: '', page_path: '/', page_url: 'http://localhost:4360/', element: ELEMENT, ...data },
})

describe('toAnnotation', () => {
  it('reads an entry into a comment', () => {
    expect(toAnnotation(entry('01A', { comment: 'Shorter', state: 'done', resolution: 'Cut it' }))).toMatchObject({ id: '01A', comment: 'Shorter', state: 'done', resolution: 'Cut it', pagePath: '/', element: ELEMENT })
  })

  it('treats an unknown or missing state as open', () => {
    expect(toAnnotation(entry('01A', { state: 'banana' }))?.state).toBe('open')
    expect(toAnnotation(entry('01A', { state: undefined }))?.state).toBe('open')
  })

  it('skips an entry without an element (not one of ours)', () => {
    expect(toAnnotation({ id: '01A', data: { comment: 'x' } })).toBeNull()
    expect(toAnnotation({ data: { element: ELEMENT } })).toBeNull()
  })

  it('reads the creation time as UTC', () => {
    expect(toAnnotation(entry('01A'))?.createdAt).toBe(Date.parse('2026-11-12T11:13:46Z'))
  })
})

describe('createFeedbackApi', () => {
  it('lists comments, oldest first, sending the session and the CSRF header', async () => {
    const fetcher = vi.fn(async () => json({ data: { items: [entry('01A'), entry('01B')] } }))
    const comments = await createFeedbackApi(fetcher as unknown as typeof fetch).list()
    expect(comments.map((c) => c.id)).toEqual(['01A', '01B'])
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('/_emdash/api/content/feedback?')
    expect(url).toContain('orderBy=createdAt')
    expect(url).toContain('order=asc')
    expect(init).toMatchObject({ credentials: 'same-origin', headers: { 'X-EmDash-Request': '1' } })
  })

  it('follows the cursor to the next page', async () => {
    const fetcher = vi.fn(async (url: string) => (url.includes('cursor=next') ? json({ data: { items: [entry('01B')] } }) : json({ data: { items: [entry('01A')], nextCursor: 'next' } })))
    const comments = await createFeedbackApi(fetcher as unknown as typeof fetch).list()
    expect(comments.map((c) => c.id)).toEqual(['01A', '01B'])
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('creates a comment with a title, an open state and the element', async () => {
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => json({ data: { item: { ...entry('01NEW'), data: { ...JSON.parse(String(init?.body)).data } } } }))
    const created = await createFeedbackApi(fetcher as unknown as typeof fetch).create({ comment: 'x'.repeat(200), element: ELEMENT, pagePath: '/posts/a', pageUrl: 'http://localhost:4360/posts/a' })
    const sent = JSON.parse(String((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body)).data
    expect(sent).toMatchObject({ state: 'open', resolution: '', page_path: '/posts/a', selector: 'main > h1', element: ELEMENT })
    expect(sent.title.length).toBeLessThanOrEqual(80)
    expect(sent.title.endsWith('…')).toBe(true)
    expect(created.id).toBe('01NEW')
  })

  it('deletes by id', async () => {
    const fetcher = vi.fn(async () => json({ success: true }))
    await createFeedbackApi(fetcher as unknown as typeof fetch).remove('01/A')
    expect(fetcher).toHaveBeenCalledWith('/_emdash/api/content/feedback/01%2FA', expect.objectContaining({ method: 'DELETE' }))
  })

  it.each([
    [404, FEEDBACK_PROBLEM.MISSING],
    [401, FEEDBACK_PROBLEM.FORBIDDEN],
    [403, FEEDBACK_PROBLEM.FORBIDDEN],
    [500, FEEDBACK_PROBLEM.OTHER],
  ])('turns HTTP %s into a "%s" problem with a readable message', async (status, problem) => {
    const fetcher = vi.fn(async () => json({}, status))
    const error = await createFeedbackApi(fetcher as unknown as typeof fetch).list().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(FeedbackError)
    expect((error as FeedbackError).problem).toBe(problem)
    expect((error as FeedbackError).message.length).toBeGreaterThan(20)
  })

  it('names the fix when the collection is missing', async () => {
    const fetcher = vi.fn(async () => json({}, 404))
    const error = (await createFeedbackApi(fetcher as unknown as typeof fetch).list().catch((e: unknown) => e)) as FeedbackError
    expect(error.message).toContain('emdash seed seed/seed.json --no-content')
  })

  it('reports an unreachable server', async () => {
    const fetcher = vi.fn(async () => {
      throw new TypeError('offline')
    })
    const error = (await createFeedbackApi(fetcher as unknown as typeof fetch).list().catch((e: unknown) => e)) as FeedbackError
    expect(error.problem).toBe(FEEDBACK_PROBLEM.OTHER)
    expect(error.message).toContain('could not be reached')
  })
})
