import type { ImpactValue, Result } from 'axe-core'
import { CATEGORY, IGNORED_SELECTOR, SEVERITY, type Severity } from './constants'
import type { AuditIssue } from './types'

const SEVERITY_BY_IMPACT: Record<NonNullable<ImpactValue>, Severity> = {
  critical: SEVERITY.ERROR,
  serious: SEVERITY.ERROR,
  moderate: SEVERITY.WARNING,
  minor: SEVERITY.INFO,
}

export const violationToIssues = (violation: Result): AuditIssue[] =>
  violation.nodes.map((node) => ({
    id: `a11y-${violation.id}`,
    category: CATEGORY.A11Y,
    severity: SEVERITY_BY_IMPACT[violation.impact ?? 'minor'],
    message: violation.help,
    selector: node.target.flat().join(' ') || undefined,
    helpUrl: violation.helpUrl,
  }))

/** axe-core is loaded on demand: it is large and only the Audit button needs it. */
export const a11yChecks = async (): Promise<AuditIssue[]> => {
  const axe = (await import('axe-core')).default
  const result = await axe.run({ exclude: IGNORED_SELECTOR.split(', ').map((selector) => [selector]) })
  return result.violations.flatMap(violationToIssues)
}
