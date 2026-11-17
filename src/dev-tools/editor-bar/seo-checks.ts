import { CATEGORY, LIMITS, SEVERITY } from './constants'
import { cssPath, isIgnored } from './selector'
import type { AuditIssue } from './types'

const issue = (id: string, severity: AuditIssue['severity'], message: string, element?: Element): AuditIssue => ({
  id,
  category: CATEGORY.SEO,
  severity,
  message,
  selector: element ? cssPath(element) : undefined,
})

const metaContent = (doc: Document, selector: string): string =>
  doc.head.querySelector<HTMLMetaElement>(selector)?.content.trim() ?? ''

const checkTitle = (doc: Document): AuditIssue[] => {
  const title = doc.title.trim()
  if (!title) return [issue('seo-title-missing', SEVERITY.ERROR, 'The page has no <title>.')]
  if (title.length < LIMITS.TITLE_MIN) return [issue('seo-title-short', SEVERITY.WARNING, `Title is only ${title.length} characters (aim for ${LIMITS.TITLE_MIN}–${LIMITS.TITLE_MAX}).`)]
  if (title.length > LIMITS.TITLE_MAX) return [issue('seo-title-long', SEVERITY.WARNING, `Title is ${title.length} characters; search engines cut it near ${LIMITS.TITLE_MAX}.`)]
  return []
}

const checkDescription = (doc: Document): AuditIssue[] => {
  const description = metaContent(doc, 'meta[name="description"]')
  if (!description) return [issue('seo-description-missing', SEVERITY.ERROR, 'No meta description.')]
  if (description.length < LIMITS.DESCRIPTION_MIN) return [issue('seo-description-short', SEVERITY.WARNING, `Meta description is only ${description.length} characters (aim for ${LIMITS.DESCRIPTION_MIN}–${LIMITS.DESCRIPTION_MAX}).`)]
  if (description.length > LIMITS.DESCRIPTION_MAX) return [issue('seo-description-long', SEVERITY.INFO, `Meta description is ${description.length} characters; it will be truncated near ${LIMITS.DESCRIPTION_MAX}.`)]
  return []
}

const checkHeadings = (doc: Document): AuditIssue[] => {
  const h1s = [...doc.body.querySelectorAll('h1')].filter((h) => !isIgnored(h))
  if (h1s.length === 0) return [issue('seo-h1-missing', SEVERITY.ERROR, 'The page has no <h1>.')]
  if (h1s.length > 1) return h1s.slice(1).map((h) => issue('seo-h1-multiple', SEVERITY.WARNING, `Extra <h1> "${h.textContent?.trim().slice(0, 50)}" — keep one per page.`, h))
  return []
}

const checkHead = (doc: Document): AuditIssue[] => {
  const issues: AuditIssue[] = []
  if (!doc.documentElement.lang) issues.push(issue('seo-lang-missing', SEVERITY.WARNING, '<html> has no lang attribute.'))
  if (!doc.head.querySelector('link[rel="canonical"]')) issues.push(issue('seo-canonical-missing', SEVERITY.WARNING, 'No canonical link.'))
  if (/noindex/i.test(metaContent(doc, 'meta[name="robots"]'))) issues.push(issue('seo-noindex', SEVERITY.INFO, 'The page is marked noindex (expected for drafts and previews only).'))
  for (const property of ['og:title', 'og:image'] as const) {
    if (!metaContent(doc, `meta[property="${property}"]`)) issues.push(issue(`seo-${property.replace(':', '-')}-missing`, SEVERITY.INFO, `Missing ${property} (shared link preview).`))
  }
  return issues
}

const checkLinks = (doc: Document): AuditIssue[] =>
  [...doc.body.querySelectorAll<HTMLAnchorElement>('a[href]')]
    .filter((a) => !isIgnored(a))
    .filter((a) => ['', '#'].includes(a.getAttribute('href')?.trim() ?? ''))
    .map((a) => issue('seo-link-empty-href', SEVERITY.WARNING, 'Link with an empty or "#" href is not crawlable.', a))

export const seoChecks = (doc: Document): AuditIssue[] => [
  ...checkTitle(doc),
  ...checkDescription(doc),
  ...checkHeadings(doc),
  ...checkHead(doc),
  ...checkLinks(doc),
]
