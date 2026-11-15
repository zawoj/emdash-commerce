import { a11yChecks } from './a11y'
import { CATEGORY, SEVERITY } from './constants'
import { perfChecks } from './perf-checks'
import { seoChecks } from './seo-checks'
import type { AuditIssue } from './types'

const RANK = { [SEVERITY.ERROR]: 0, [SEVERITY.WARNING]: 1, [SEVERITY.INFO]: 2 } as const

export const sortIssues = (issues: AuditIssue[]): AuditIssue[] => [...issues].sort((a, b) => RANK[a.severity] - RANK[b.severity])

/** a11y (axe-core), SEO and performance checks of the page as it is rendered right now. */
export const runAudit = async (doc: Document = document): Promise<AuditIssue[]> => {
  const a11y = await a11yChecks().catch((error: unknown): AuditIssue[] => [
    { id: 'a11y-axe-failed', category: CATEGORY.A11Y, severity: SEVERITY.INFO, message: `Accessibility scan could not run: ${String(error)}` },
  ])
  return sortIssues([...a11y, ...seoChecks(doc), ...perfChecks(doc)])
}
