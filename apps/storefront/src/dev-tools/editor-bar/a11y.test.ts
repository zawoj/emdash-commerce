import type { Result } from 'axe-core'
import { describe, expect, it } from 'vitest'
import { violationToIssues } from './a11y'
import { sortIssues } from './audit'
import { CATEGORY, SEVERITY } from './constants'

const violation = (impact: Result['impact']): Result =>
  ({
    id: 'image-alt',
    impact,
    help: 'Images must have alternative text',
    helpUrl: 'https://dequeuniversity.com/rules/axe/image-alt',
    nodes: [{ target: ['#a'] }, { target: [['iframe', 'img.b']] }],
  }) as unknown as Result

describe('violationToIssues', () => {
  it('makes one issue per offending node, with a selector and a docs link', () => {
    const issues = violationToIssues(violation('serious'))
    expect(issues).toHaveLength(2)
    expect(issues[0]).toMatchObject({ category: CATEGORY.A11Y, severity: SEVERITY.ERROR, selector: '#a', id: 'a11y-image-alt' })
    expect(issues[1]?.selector).toBe('iframe img.b')
  })

  it.each([
    ['critical', SEVERITY.ERROR],
    ['moderate', SEVERITY.WARNING],
    ['minor', SEVERITY.INFO],
  ] as const)('maps %s impact to %s', (impact, severity) => {
    expect(violationToIssues(violation(impact))[0]?.severity).toBe(severity)
  })
})

describe('sortIssues', () => {
  it('puts errors before warnings before info without mutating the input', () => {
    const input = [SEVERITY.INFO, SEVERITY.ERROR, SEVERITY.WARNING].map((severity) => ({ id: severity, category: CATEGORY.SEO, severity, message: severity }))
    expect(sortIssues(input).map((i) => i.severity)).toEqual([SEVERITY.ERROR, SEVERITY.WARNING, SEVERITY.INFO])
    expect(input[0]?.severity).toBe(SEVERITY.INFO)
  })
})
