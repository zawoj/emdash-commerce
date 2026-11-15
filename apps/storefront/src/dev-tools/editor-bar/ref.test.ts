import { describe, expect, it } from 'vitest'
import { adminUrlFor, islandLabel, parseRef, refLabel, refOf } from './ref'

const REF = { collection: 'posts', id: '01ABC', field: 'title', status: 'published' }

describe('parseRef', () => {
  it('reads the JSON EmDash writes into data-emdash-ref', () => {
    expect(parseRef(JSON.stringify(REF))).toEqual(REF)
  })

  it.each([null, '', 'not json', '[]', '{"id":"x"}', '{"collection":"posts"}'])('rejects %s', (raw) => {
    expect(parseRef(raw)).toBeNull()
  })
})

describe('element helpers', () => {
  it('finds the ref of a field from a nested element and builds the admin link', () => {
    document.body.innerHTML = `<h1 data-emdash-ref='${JSON.stringify(REF)}'><span id="inner">Hi</span></h1>`
    const ref = refOf(document.getElementById('inner')!)!
    expect(refLabel(ref)).toBe('posts › title')
    expect(adminUrlFor(ref)).toBe('/_emdash/admin/content/posts/01ABC')
  })

  it('names an island by its export, falling back to the file name', () => {
    document.body.innerHTML = `<astro-island component-export="Search" component-url="/a/Search.js"><b id="x"></b></astro-island>
      <astro-island component-export="default" component-url="/a/Menu.tsx?v=1"><b id="y"></b></astro-island>`
    expect(islandLabel(document.getElementById('x')!)).toBe('Search')
    expect(islandLabel(document.getElementById('y')!)).toBe('Menu.tsx')
  })
})

describe('collectionsOnPage', () => {
  it('lists each collection with an editable field once', async () => {
    const { collectionsOnPage } = await import('./ref')
    document.body.innerHTML = `<h1 data-emdash-ref='{"collection":"posts","id":"1","field":"title"}'></h1>
      <p data-emdash-ref='{"collection":"posts","id":"1","field":"excerpt"}'></p>
      <div data-emdash-ref='{"collection":"home","id":"2","field":"hero_image"}'></div>
      <div data-emdash-ref='not json'></div>`
    expect(collectionsOnPage()).toEqual(['posts', 'home'])
  })
})
