import { describe, expect, it } from 'vitest'
import { perfChecks } from './perf-checks'

const setBody = (html: string): void => {
  document.body.innerHTML = html
}

describe('perfChecks', () => {
  it('flags an image without width/height', () => {
    setBody('<img id="hero" src="/hero.jpg" alt="">')
    const issue = perfChecks(document, 800).find((i) => i.id === 'perf-img-dimensions')
    expect(issue?.selector).toBe('#hero')
    expect(issue?.message).toContain('hero.jpg')
  })

  it('accepts an image that declares its size', () => {
    setBody('<img src="/a.jpg" alt="" width="10" height="10">')
    expect(perfChecks(document, 800).map((i) => i.id)).not.toContain('perf-img-dimensions')
  })

  it('flags an oversized image using the rendered width', () => {
    setBody('<img id="big" src="/big.jpg" alt="" width="100" height="100">')
    const img = document.querySelector('img')!
    Object.defineProperty(img, 'naturalWidth', { value: 1000 })
    img.getBoundingClientRect = () => ({ width: 100, top: 0 }) as DOMRect
    expect(perfChecks(document, 800).map((i) => i.id)).toContain('perf-img-oversized')
  })

  it('suggests lazy loading only below the fold', () => {
    setBody('<img id="low" src="/low.jpg" alt="" width="1" height="1">')
    const img = document.querySelector('img')!
    img.getBoundingClientRect = () => ({ width: 1, top: 2000 }) as DOMRect
    expect(perfChecks(document, 800).map((i) => i.id)).toContain('perf-img-lazy')
    img.loading = 'lazy'
    expect(perfChecks(document, 800).map((i) => i.id)).not.toContain('perf-img-lazy')
  })

  it('warns about a large DOM', () => {
    setBody(`<div>${'<i></i>'.repeat(1600)}</div>`)
    expect(perfChecks(document, 800).map((i) => i.id)).toContain('perf-dom-size')
  })
})
