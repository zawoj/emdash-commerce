import { describe, expect, it, vi } from 'vitest'
import { fetchSchema } from './schema'

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('fetchSchema', () => {
  it('reads every collection with its fields, using the editor session and the CSRF header', async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      const path = String(url)
      if (path.endsWith('/collections')) return json({ data: { items: [{ slug: 'home' }, { slug: 'posts' }] } })
      if (path.includes('/collections/home?')) return json({ data: { item: { slug: 'home', label: 'Homepage', fields: [{ slug: 'hero_image', type: 'image', label: 'Intro image', required: false }] } } })
      return json({ data: { item: { slug: 'posts', label: 'Posts', fields: [{ slug: 'title', type: 'string', label: 'Title', required: true }, { bad: true }] } } })
    })
    const schema = await fetchSchema(fetcher as unknown as typeof fetch)
    expect(schema).toEqual([
      { slug: 'home', label: 'Homepage', fields: [{ slug: 'hero_image', type: 'image', label: 'Intro image', isRequired: false }] },
      { slug: 'posts', label: 'Posts', fields: [{ slug: 'title', type: 'string', label: 'Title', isRequired: true }] },
    ])
    expect(fetcher).toHaveBeenCalledWith('/_emdash/api/schema/collections/posts?includeFields=true', expect.objectContaining({ headers: { 'X-EmDash-Request': '1' }, credentials: 'same-origin' }))
  })

  it('resolves null when the list is refused', async () => {
    const fetcher = vi.fn(async () => json({}, 401))
    expect(await fetchSchema(fetcher as unknown as typeof fetch)).toBeNull()
  })

  it('resolves null when one collection cannot be read, rather than a partial schema', async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) => (String(url).endsWith('/collections') ? json({ data: { items: [{ slug: 'a' }] } }) : json({}, 500)))
    expect(await fetchSchema(fetcher as unknown as typeof fetch)).toBeNull()
  })

  it('resolves null when the network fails', async () => {
    const fetcher = vi.fn(async () => {
      throw new TypeError('offline')
    })
    expect(await fetchSchema(fetcher as unknown as typeof fetch)).toBeNull()
  })
})
