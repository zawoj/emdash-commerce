import { COMMENT_STATE, FEEDBACK, type CommentState } from './constants'
import type { Annotation, ElementInfo } from './types'

const HEADERS = { 'X-EmDash-Request': '1' }
const JSON_HEADERS = { ...HEADERS, 'content-type': 'application/json' }

export const FEEDBACK_PROBLEM = {
  /** The `feedback` collection does not exist in this database yet. */
  MISSING: 'missing',
  /** The session may not use the content API (not signed in, or not an editor). */
  FORBIDDEN: 'forbidden',
  OTHER: 'other',
} as const

export type FeedbackProblem = (typeof FEEDBACK_PROBLEM)[keyof typeof FEEDBACK_PROBLEM]

export class FeedbackError extends Error {
  constructor(
    readonly problem: FeedbackProblem,
    message: string,
  ) {
    super(message)
  }
}

export interface NewComment {
  comment: string
  element: ElementInfo
  pagePath: string
  pageUrl: string
}

interface ApiEntry {
  id?: unknown
  createdAt?: unknown
  data?: Record<string, unknown>
}

const asString = (value: unknown): string => (typeof value === 'string' ? value : '')

const asState = (value: unknown): CommentState => (Object.values(COMMENT_STATE) as string[]).includes(value as string) ? (value as CommentState) : COMMENT_STATE.OPEN

const isElementInfo = (value: unknown): value is ElementInfo => typeof value === 'object' && value !== null && typeof (value as ElementInfo).selector === 'string'

export const toAnnotation = (entry: ApiEntry): Annotation | null => {
  const data = entry.data ?? {}
  if (typeof entry.id !== 'string' || !isElementInfo(data.element)) return null
  const createdAt = typeof entry.createdAt === 'string' ? Date.parse(entry.createdAt.replace(' ', 'T') + (entry.createdAt.endsWith('Z') ? '' : 'Z')) : Date.now()
  return {
    id: entry.id,
    comment: asString(data.comment),
    element: data.element,
    state: asState(data.state),
    resolution: asString(data.resolution),
    pagePath: asString(data.page_path),
    pageUrl: asString(data.page_url),
    createdAt: Number.isNaN(createdAt) ? Date.now() : createdAt,
  }
}

const problemFor = (status: number): FeedbackProblem => {
  if (status === 404) return FEEDBACK_PROBLEM.MISSING
  if (status === 401 || status === 403) return FEEDBACK_PROBLEM.FORBIDDEN
  return FEEDBACK_PROBLEM.OTHER
}

const MESSAGES: Record<FeedbackProblem, string> = {
  [FEEDBACK_PROBLEM.MISSING]: 'The "feedback" collection does not exist in this database. Create it with: pnpm --filter @emdash-commerce/storefront exec emdash seed seed/seed.json --no-content',
  [FEEDBACK_PROBLEM.FORBIDDEN]: 'Not allowed to read or write comments — sign in to the EmDash admin as an editor.',
  [FEEDBACK_PROBLEM.OTHER]: 'The comments could not be saved or loaded.',
}

const request = async (fetcher: typeof fetch, url: string, init: RequestInit = {}): Promise<unknown> => {
  let response: Response
  try {
    response = await fetcher(url, { credentials: 'same-origin', ...init })
  } catch {
    throw new FeedbackError(FEEDBACK_PROBLEM.OTHER, 'The dev server could not be reached.')
  }
  if (!response.ok) {
    const problem = problemFor(response.status)
    throw new FeedbackError(problem, `${MESSAGES[problem]} (${response.status})`)
  }
  return response.status === 204 ? null : response.json().catch(() => null)
}

const titleOf = (comment: string): string => {
  const line = comment.replace(/\s+/g, ' ').trim()
  return line.length > FEEDBACK.TITLE_MAX ? `${line.slice(0, FEEDBACK.TITLE_MAX - 1)}…` : line
}

export const createFeedbackApi = (fetcher: typeof fetch = (...args) => window.fetch(...args)) => ({
  /** Every comment, oldest first, following the cursor for a few pages. */
  list: async (): Promise<Annotation[]> => {
    const comments: Annotation[] = []
    let cursor: string | null = null
    for (let page = 0; page < FEEDBACK.MAX_PAGES; page += 1) {
      const query = new URLSearchParams({ limit: String(FEEDBACK.PAGE_SIZE), orderBy: 'createdAt', order: 'asc', ...(cursor ? { cursor } : {}) })
      const body = (await request(fetcher, `${FEEDBACK.API}?${query}`, { headers: HEADERS })) as { data?: { items?: ApiEntry[]; nextCursor?: string | null } } | null
      for (const entry of body?.data?.items ?? []) {
        const annotation = toAnnotation(entry)
        if (annotation) comments.push(annotation)
      }
      cursor = body?.data?.nextCursor ?? null
      if (!cursor) break
    }
    return comments
  },

  create: async (input: NewComment): Promise<Annotation> => {
    const data = {
      title: titleOf(input.comment),
      comment: input.comment,
      state: COMMENT_STATE.OPEN,
      resolution: '',
      page_path: input.pagePath,
      page_url: input.pageUrl,
      selector: input.element.selector,
      element: input.element,
    }
    const body = (await request(fetcher, FEEDBACK.API, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ data }) })) as { data?: { item?: ApiEntry } } | null
    const created = body?.data?.item ? toAnnotation(body.data.item) : null
    if (!created) throw new FeedbackError(FEEDBACK_PROBLEM.OTHER, MESSAGES[FEEDBACK_PROBLEM.OTHER])
    return created
  },

  remove: async (id: string): Promise<void> => {
    await request(fetcher, `${FEEDBACK.API}/${encodeURIComponent(id)}`, { method: 'DELETE', headers: HEADERS })
  },
})

export type FeedbackApi = ReturnType<typeof createFeedbackApi>
