import { describe, expect, it } from 'vitest'
import { describeElement } from './describe-element'

describe('describeElement', () => {
  it('collects tag, classes, selector and a whitespace-collapsed text snippet', () => {
    document.body.innerHTML = '<main><h1 id="t" class="a b">  Hello \n   world  </h1></main>'
    const info = describeElement(document.getElementById('t')!)
    expect(info).toMatchObject({ tag: 'h1', id: 't', classNames: ['a', 'b'], selector: '#t', text: 'Hello world' })
  })

  it('cuts long text', () => {
    document.body.innerHTML = `<p id="p">${'word '.repeat(100)}</p>`
    const info = describeElement(document.getElementById('p')!)
    expect(info.text.endsWith('…')).toBe(true)
    expect(info.text.length).toBeLessThanOrEqual(161)
  })

  it('reads the EmDash field, the island and the Astro source of the element or its ancestors', () => {
    document.body.innerHTML = `<section data-astro-source-file="/x/src/pages/a.astro" data-astro-source-loc="12:3">
      <div data-emdash-ref='{"collection":"posts","id":"01A","field":"title","status":"draft"}'>
        <astro-island component-export="Editor"><span id="s">Hi</span></astro-island></div></section>`
    const info = describeElement(document.getElementById('s')!)
    expect(info.ref).toMatchObject({ collection: 'posts', id: '01A', field: 'title' })
    expect(info.island).toBe('Editor')
    expect(info.source).toBe('pages/a.astro:12:3')
  })

  it('records image source and alt, and the link an element sits in', () => {
    document.body.innerHTML = '<a href="/posts/x"><img id="i" src="/a.png" alt="Cat"></a>'
    const info = describeElement(document.getElementById('i')!)
    expect(info).toMatchObject({ href: '/posts/x', src: '/a.png', alt: 'Cat' })
  })

  it('has no ref, island or source on a plain element', () => {
    document.body.innerHTML = '<p id="p">x</p>'
    expect(describeElement(document.getElementById('p')!)).toMatchObject({ ref: null, island: null, source: null })
  })
})
