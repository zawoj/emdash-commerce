import { beforeEach, describe, expect, it } from 'vitest'
import { seoChecks } from './seo-checks'

const setPage = (head: string, body: string): void => {
  document.documentElement.lang = ''
  document.head.innerHTML = head
  document.body.innerHTML = body
}

const ids = (): string[] => seoChecks(document).map((i) => i.id)

const GOOD_HEAD = `<title>A reasonably long page title</title>
  <meta name="description" content="${'d'.repeat(100)}">
  <link rel="canonical" href="/x">
  <meta property="og:title" content="t"><meta property="og:image" content="/i.png">`

describe('seoChecks', () => {
  beforeEach(() => {
    document.documentElement.lang = 'en'
  })

  it('reports nothing for a complete page', () => {
    setPage(GOOD_HEAD, '<h1>Hello</h1>')
    document.documentElement.lang = 'en'
    expect(ids()).toEqual([])
  })

  it('flags a missing title, description and h1', () => {
    setPage('', '<p>no heading</p>')
    expect(ids()).toEqual(expect.arrayContaining(['seo-title-missing', 'seo-description-missing', 'seo-h1-missing']))
  })

  it('flags a too-long title and points extra h1s at the element', () => {
    setPage(`<title>${'t'.repeat(80)}</title>`, '<h1>One</h1><h1 id="second">Two</h1>')
    const issues = seoChecks(document)
    expect(issues.map((i) => i.id)).toContain('seo-title-long')
    expect(issues.find((i) => i.id === 'seo-h1-multiple')?.selector).toBe('#second')
  })

  it('flags noindex and "#" links', () => {
    setPage(`${GOOD_HEAD}<meta name="robots" content="noindex">`, '<h1>x</h1><a href="#">go</a>')
    expect(ids()).toEqual(expect.arrayContaining(['seo-noindex', 'seo-link-empty-href']))
  })

  it('ignores the add-on and the EmDash pill', () => {
    setPage(GOOD_HEAD, '<h1>x</h1><div id="emdash-toolbar"><h1>pill</h1><a href="#">x</a></div>')
    document.documentElement.lang = 'en'
    expect(ids()).toEqual([])
  })
})
