import { SCHEMA_API } from './constants'
import type { SchemaCollection, SchemaField, SiteSchema } from './types'

interface ApiField {
  slug?: unknown
  type?: unknown
  label?: unknown
  required?: unknown
}

interface ApiCollection {
  slug?: unknown
  label?: unknown
  fields?: ApiField[]
}

const HEADERS = { 'X-EmDash-Request': '1' }

const toField = (field: ApiField): SchemaField | null => {
  if (typeof field.slug !== 'string' || typeof field.type !== 'string') return null
  return { slug: field.slug, type: field.type, label: typeof field.label === 'string' ? field.label : field.slug, isRequired: field.required === true }
}

const toCollection = (item: ApiCollection | undefined): SchemaCollection | null => {
  if (!item || typeof item.slug !== 'string') return null
  const fields = (item.fields ?? []).map(toField).filter((f): f is SchemaField => f !== null)
  return { slug: item.slug, label: typeof item.label === 'string' ? item.label : item.slug, fields }
}

const getJson = async (fetcher: typeof fetch, url: string): Promise<unknown> => {
  const response = await fetcher(url, { headers: HEADERS, credentials: 'same-origin' })
  if (!response.ok) throw new Error(`${url} → ${response.status}`)
  return response.json()
}

/**
 * Collections and their fields, read with the editor's own session (the same calls the admin makes).
 * Resolves null when it cannot be read, so the prompt can still be built without it.
 */
export const fetchSchema = async (fetcher: typeof fetch = (...args) => window.fetch(...args)): Promise<SiteSchema | null> => {
  try {
    const list = (await getJson(fetcher, SCHEMA_API)) as { data?: { items?: ApiCollection[] } }
    const slugs = (list.data?.items ?? []).map((item) => item.slug).filter((slug): slug is string => typeof slug === 'string')
    const details = await Promise.all(
      slugs.map(async (slug) => {
        const body = (await getJson(fetcher, `${SCHEMA_API}/${encodeURIComponent(slug)}?includeFields=true`)) as { data?: { item?: ApiCollection } }
        return toCollection(body.data?.item)
      }),
    )
    return details.filter((c): c is SchemaCollection => c !== null)
  } catch {
    return null
  }
}
