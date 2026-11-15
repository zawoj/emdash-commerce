import { EMDASH } from './constants'
import type { EmDashRef } from './types'

export const parseRef = (raw: string | null): EmDashRef | null => {
  if (!raw) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return null
    const ref = value as Partial<EmDashRef>
    if (typeof ref.collection !== 'string' || typeof ref.id !== 'string') return null
    return ref as EmDashRef
  } catch {
    return null
  }
}

export const refOf = (element: Element): EmDashRef | null => {
  const holder = element.closest(EMDASH.REF_SELECTOR)
  return holder ? parseRef(holder.getAttribute(EMDASH.REF_ATTR)) : null
}

export const adminUrlFor = (ref: EmDashRef): string =>
  `${EMDASH.ADMIN_CONTENT_PATH}/${encodeURIComponent(ref.collection)}/${encodeURIComponent(ref.id)}`

export const refLabel = (ref: EmDashRef): string => (ref.field ? `${ref.collection} › ${ref.field}` : ref.collection)

/** Label for an Astro island, from the attributes Astro writes on `<astro-island>`. */
export const islandLabel = (element: Element): string | null => {
  const island = element.closest('astro-island')
  if (!island) return null
  const exportName = island.getAttribute('component-export')
  const url = island.getAttribute('component-url') ?? ''
  const file = url.split('?')[0]?.split('/').pop() ?? ''
  return exportName && exportName !== 'default' ? exportName : file || 'island'
}

/** Collections that have at least one editable field on this page (from the `data-emdash-ref` attributes). */
export const collectionsOnPage = (root: ParentNode = document): string[] => {
  const slugs = new Set<string>()
  for (const element of root.querySelectorAll(EMDASH.REF_SELECTOR)) {
    const ref = parseRef(element.getAttribute(EMDASH.REF_ATTR))
    if (ref) slugs.add(ref.collection)
  }
  return [...slugs]
}
